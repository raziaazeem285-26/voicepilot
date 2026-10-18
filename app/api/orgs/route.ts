// /api/orgs — list my organizations / create a new one.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireApiUser, jsonError, checkRateLimit } from "@/lib/api";
import { auditLog } from "@/lib/audit";

export async function GET(req: NextRequest) {
  const maybeUser = await requireApiUser(req);
  if (maybeUser instanceof NextResponse) return maybeUser;
  const memberships = await prisma.membership.findMany({
    where: { userId: maybeUser.id },
    include: { org: { include: { plan: true } } },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({
    orgs: memberships.map(m => ({
      id: m.org.id, name: m.org.name, role: m.role,
      plan: m.org.plan ? { key: m.org.plan.key, name: m.org.plan.name } : { key: m.org.planKey, name: m.org.planKey },
    })),
  });
}

export async function POST(req: NextRequest) {
  const limited = checkRateLimit(req, "orgs:create", 10, 60_000);
  if (limited) return limited;
  const maybeUser = await requireApiUser(req);
  if (maybeUser instanceof NextResponse) return maybeUser;
  let body: { name?: string };
  try { body = await req.json(); } catch { return jsonError("Invalid JSON body"); }
  const name = String(body.name ?? "").trim();
  if (!name) return jsonError("Organization name is required.");
  const org = await prisma.organization.create({
    data: { name, planKey: "free", memberships: { create: { userId: maybeUser.id, role: "owner" } } },
  });
  await auditLog({ orgId: org.id, userId: maybeUser.id, action: "org.create", entityType: "organization", entityId: org.id });
  return NextResponse.json({ org: { id: org.id, name: org.name, planKey: org.planKey } }, { status: 201 });
}
