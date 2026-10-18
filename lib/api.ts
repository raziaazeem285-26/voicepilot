// API helpers: auth resolution, tenant scoping, error responses.
import { NextRequest, NextResponse } from "next/server";
import { getUserByToken, readSessionToken, requireOrgRole, type SessionUser } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";

export function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

/** Resolve the current user from the request cookies. Returns null when unauthenticated. */
export async function apiUser(req: NextRequest): Promise<SessionUser | null> {
  const token = readSessionToken(req.headers.get("cookie"));
  if (!token) return null;
  return getUserByToken(token);
}

/** Require auth; returns the user or an error response. */
export async function requireApiUser(req: NextRequest): Promise<SessionUser | NextResponse> {
  const user = await apiUser(req);
  if (!user) return jsonError("Authentication required", 401);
  return user;
}

/**
 * Require membership in an org with one of the allowed roles.
 * Returns { user } or an error Response.
 */
export async function requireOrg(
  req: NextRequest,
  orgId: string,
  allowed: Array<"owner" | "admin" | "member"> = ["owner", "admin", "member"]
): Promise<{ user: SessionUser } | NextResponse> {
  const maybeUser = await requireApiUser(req);
  if (maybeUser instanceof NextResponse) return maybeUser;
  try {
    await requireOrgRole(maybeUser, orgId, allowed);
  } catch (e) {
    const status = (e as { status?: number }).status ?? 403;
    return jsonError("Forbidden: no access to this organization", status);
  }
  return { user: maybeUser };
}

/** Rate-limit helper for sensitive routes. Returns an error Response when limited, else null. */
export function checkRateLimit(req: NextRequest, key: string, limit: number, windowMs: number): NextResponse | null {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const r = rateLimit(`${key}:${ip}`, limit, windowMs);
  if (!r.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((r.resetAt - Date.now()) / 1000)) } }
    );
  }
  return null;
}
