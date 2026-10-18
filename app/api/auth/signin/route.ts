// POST /api/auth/signin — verify credentials, create session.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createSession, sessionCookieHeader } from "@/lib/auth";
import { verifyPassword } from "@/lib/password";
import { auditLog } from "@/lib/audit";
import { checkRateLimit, jsonError } from "@/lib/api";
import { isLocked, recordFailure, clearFailures, lockoutRemainingSec } from "@/lib/auth-lockout";

export async function POST(req: NextRequest) {
  const limited = checkRateLimit(req, "auth:signin", 10, 60_000);
  if (limited) return limited;

  let body: { email?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid JSON body");
  }
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  if (!email || !password) return jsonError("Email and password are required.");

  if (isLocked(email)) {
    return NextResponse.json(
      { error: `Too many failed attempts. Try again in ${lockoutRemainingSec(email)} seconds.` },
      { status: 429 }
    );
  }

  const user = await prisma.user.findUnique({ where: { email } });
  // Constant-shape response to avoid user enumeration timing leaks (best effort).
  const ok = user ? await verifyPassword(password, user.passwordHash) : false;
  if (!user || !ok) {
    // Burn comparable time for unknown users.
    if (!user) await verifyPassword("dummy-password-for-timing", "$2b$12$aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa".slice(0, 60));
    const locked = recordFailure(email);
    return jsonError(
      locked ? "Too many failed attempts. Account temporarily locked." : "Invalid email or password.",
      locked ? 429 : 401
    );
  }
  clearFailures(email);

  const token = await createSession(user.id);
  const memberships = await prisma.membership.findMany({
    where: { userId: user.id },
    include: { org: { select: { id: true, name: true, planKey: true } } },
  });
  if (memberships[0]) {
    await auditLog({ orgId: memberships[0].orgId, userId: user.id, action: "auth.signin", entityType: "user", entityId: user.id }).catch(() => {});
  }

  const res = NextResponse.json({
    user: { id: user.id, email: user.email, name: user.name, isPlatformAdmin: user.isPlatformAdmin },
    orgs: memberships.map(m => ({ id: m.org.id, name: m.org.name, planKey: m.org.planKey, role: m.role })),
  });
  res.headers.set("Set-Cookie", sessionCookieHeader(token));
  return res;
}
