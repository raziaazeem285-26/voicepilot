// POST /api/auth/signup — create user + organization + owner membership.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createSession, sessionCookieHeader } from "@/lib/auth";
import { hashPassword } from "@/lib/password";
import { auditLog } from "@/lib/audit";
import { checkRateLimit, jsonError } from "@/lib/api";

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function POST(req: NextRequest) {
  const limited = checkRateLimit(req, "auth:signup", 10, 60_000);
  if (limited) return limited;

  let body: { email?: string; name?: string; password?: string; orgName?: string };
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid JSON body");
  }

  const email = String(body.email ?? "").trim().toLowerCase();
  const name = String(body.name ?? "").trim();
  const password = String(body.password ?? "");
  const orgName = String(body.orgName ?? "").trim() || `${name || email.split("@")[0]}'s Business`;

  if (!isValidEmail(email)) return jsonError("A valid email is required.");
  if (password.length < 8) return jsonError("Password must be at least 8 characters.");
  if (name.length > 120) return jsonError("Name is too long.");

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return jsonError("An account with this email already exists.", 409);

  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({ data: { email, name: name || null, passwordHash } });
  const org = await prisma.organization.create({
    data: { name: orgName, planKey: "free", memberships: { create: { userId: user.id, role: "owner" } } },
  });
  // Default provider config: mock, enabled, NOT live.
  const workspace = await prisma.workspace.create({
    data: {
      orgId: org.id,
      name: "Main business",
      category: "general",
      providerConfigs: { create: { provider: "mock", enabled: true, isLive: false, credentialsEnc: "" } },
    },
  });

  await auditLog({ orgId: org.id, userId: user.id, action: "auth.signup", entityType: "user", entityId: user.id });

  const token = await createSession(user.id);
  const res = NextResponse.json({
    user: { id: user.id, email: user.email, name: user.name },
    org: { id: org.id, name: org.name, planKey: org.planKey },
    workspace: { id: workspace.id, name: workspace.name },
  });
  res.headers.set("Set-Cookie", sessionCookieHeader(token));
  return res;
}
