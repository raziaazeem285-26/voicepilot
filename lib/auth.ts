// Custom session auth: bcrypt passwords + opaque session tokens in httpOnly cookies.
// Sessions are stored server-side (Session table); the cookie holds only a token.
// Do NOT use NextAuth Credentials provider here — it only supports JWT strategy
// and breaks with database sessions.
import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { prisma } from "./db";
import { hashPassword, verifyPassword } from "./password";

export { hashPassword, verifyPassword };

export const SESSION_COOKIE = "voicepilot_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function newToken(): string {
  return randomBytes(32).toString("hex");
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Create a DB session and return the raw token (caller sets the cookie). */
export async function createSession(userId: string): Promise<string> {
  const token = newToken();
  await prisma.session.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    },
  });
  return token;
}

export function sessionCookieHeader(token: string): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax${secure}; Max-Age=${SESSION_TTL_MS / 1000}`;
}

export function clearSessionCookieHeader(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

/** Resolve the raw bearer token from a cookie header value. */
export function readSessionToken(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  const m = cookieHeader.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`));
  return m ? m[1] : null;
}

export type SessionUser = {
  id: string;
  email: string;
  name: string | null;
  isPlatformAdmin: boolean;
};

/** Look up the user for a raw session token. Returns null if missing/expired. */
export async function getUserByToken(token: string): Promise<SessionUser | null> {
  const th = hashToken(token);
  const session = await prisma.session.findUnique({
    where: { tokenHash: th },
    include: { user: true },
  });
  if (!session) return null;
  if (session.expiresAt.getTime() < Date.now()) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }
  // timing-safe compare on the stored hash (defense in depth)
  const a = Buffer.from(session.tokenHash, "utf8");
  const b = Buffer.from(th, "utf8");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
    isPlatformAdmin: session.user.isPlatformAdmin,
  };
}

/** Server-component helper: current user from cookies(), or null. */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return getUserByToken(token);
}

/** Destroy a session by raw token. */
export async function destroySession(token: string): Promise<void> {
  await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
}

/** Membership roles for an org. Returns null when the user has no membership. */
export async function getMembership(
  userId: string,
  orgId: string
): Promise<{ role: string } | null> {
  const m = await prisma.membership.findUnique({
    where: { userId_orgId: { userId, orgId } },
    select: { role: true },
  });
  return m;
}

export async function requireOrgRole(
  user: SessionUser,
  orgId: string,
  allowed: Array<"owner" | "admin" | "member">
): Promise<void> {
  const m = await getMembership(user.id, orgId);
  if (!m || !allowed.includes(m.role as "owner" | "admin" | "member")) {
    const err = new Error("Forbidden: insufficient role for this organization");
    (err as { status?: number }).status = 403;
    throw err;
  }
}
