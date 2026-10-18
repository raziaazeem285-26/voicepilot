// Integration tests: tenant isolation + auth + RBAC (against voicepilot_test DB).
// Proves cross-tenant access is denied at the data-access layer.
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createSession, getUserByToken, requireOrgRole } from "@/lib/auth";
import { hashPassword } from "@/lib/password";
import { withWorkspace } from "@/lib/tenant";
import { encryptJson, decryptJson } from "@/lib/crypto";

function reqWithToken(token: string | null): NextRequest {
  const headers = new Headers();
  if (token) headers.set("cookie", `voicepilot_session=${token}`);
  return new NextRequest("http://localhost/api/test", { headers });
}

describe("tenant isolation", () => {
  let orgA: string, orgB: string, wsA: string, userA: string, userB: string, tokenA: string, tokenB: string;

  beforeAll(async () => {
    // Clean slate
    await prisma.auditLog.deleteMany();
    await prisma.session.deleteMany();
    await prisma.membership.deleteMany();
    await prisma.organization.deleteMany();
    await prisma.user.deleteMany();

    // Billing plan for the FK on Organization.planKey
    await prisma.billingPlan.upsert({
      where: { key: "free" },
      update: {},
      create: {
        key: "free", name: "Free Demo", priceMonthlyUsd: 0, includedMinutes: 15,
        overagePerMinUsd: 0, maxWorkspaces: 1, maxAgents: 1, features: {},
      },
    });

    const mkUser = async (email: string) => {
      const u = await prisma.user.create({ data: { email, passwordHash: await hashPassword("password123") } });
      return u.id;
    };
    userA = await mkUser("alice@test.local");
    userB = await mkUser("bob@test.local");

    const org1 = await prisma.organization.create({ data: { name: "Org A", planKey: "free" } });
    const org2 = await prisma.organization.create({ data: { name: "Org B", planKey: "free" } });
    orgA = org1.id; orgB = org2.id;

    await prisma.membership.create({ data: { userId: userA, orgId: orgA, role: "owner" } });
    await prisma.membership.create({ data: { userId: userB, orgId: orgB, role: "owner" } });

    const ws = await prisma.workspace.create({ data: { orgId: orgA, name: "WS A" } });
    wsA = ws.id;

    tokenA = await createSession(userA);
    tokenB = await createSession(userB);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("resolves the correct user from a session token", async () => {
    const u = await getUserByToken(tokenA);
    expect(u?.id).toBe(userA);
    expect(await getUserByToken("bogus-token")).toBeNull();
  });

  it("withWorkspace allows the owning org member", async () => {
    const res = await withWorkspace(reqWithToken(tokenA), wsA);
    expect(res).not.toBeInstanceOf(NextResponse);
    if (!(res instanceof NextResponse)) expect(res.workspace.id).toBe(wsA);
  });

  it("withWorkspace DENIES a user from another org (cross-tenant)", async () => {
    const res = await withWorkspace(reqWithToken(tokenB), wsA);
    expect(res).toBeInstanceOf(NextResponse);
    expect((res as NextResponse).status).toBe(403);
  });

  it("withWorkspace DENIES unauthenticated requests", async () => {
    const res = await withWorkspace(reqWithToken(null), wsA);
    expect(res).toBeInstanceOf(NextResponse);
    expect((res as NextResponse).status).toBe(401);
  });

  it("withWorkspace returns 404 for unknown workspace (no org leak)", async () => {
    const res = await withWorkspace(reqWithToken(tokenA), "nonexistent-id");
    expect(res).toBeInstanceOf(NextResponse);
    expect((res as NextResponse).status).toBe(404);
  });

  it("requireOrgRole enforces roles", async () => {
    const u = await getUserByToken(tokenA);
    // owner passes owner-only check
    await expect(requireOrgRole(u!, orgA, ["owner"])).resolves.toBeUndefined();
    // userB has no membership in orgA
    const ub = await getUserByToken(tokenB);
    await expect(requireOrgRole(ub!, orgA, ["owner", "admin", "member"])).rejects.toThrow();
  });

  it("encrypts provider credentials and never stores plaintext", async () => {
    const secret = { apiKey: "sk-live-abc123" };
    const enc = encryptJson(secret);
    expect(enc).not.toContain("sk-live-abc123");
    const ws = await prisma.workspace.create({ data: { orgId: orgB, name: "WS B" } });
    await prisma.providerConfig.create({
      data: { workspaceId: ws.id, provider: "twilio", credentialsEnc: enc, enabled: false, isLive: false },
    });
    const saved = await prisma.providerConfig.findFirst({ where: { workspaceId: ws.id, provider: "twilio" } });
    expect(saved!.credentialsEnc).not.toContain("sk-live-abc123");
    expect(decryptJson<{ apiKey: string }>(saved!.credentialsEnc).apiKey).toBe("sk-live-abc123");
  });
});
