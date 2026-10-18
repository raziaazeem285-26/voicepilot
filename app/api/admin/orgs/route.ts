// GET /api/admin/orgs — all organizations with plan + usage summary.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePlatformAdmin } from "@/lib/admin";

export async function GET(req: NextRequest) {
  const admin = await requirePlatformAdmin(req);
  if (admin instanceof NextResponse) return admin;
  const orgs = await prisma.organization.findMany({
    include: {
      plan: true,
      _count: { select: { workspaces: true, memberships: true } },
      workspaces: { select: { id: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  const wsIds = orgs.flatMap(o => o.workspaces.map(w => w.id));
  const usage = await prisma.usageRecord.findMany({
    where: { workspaceId: { in: wsIds }, period: new Date().toISOString().slice(0, 7) },
  });
  const usageByWs = Object.fromEntries(usage.map(u => [u.workspaceId, u]));
  return NextResponse.json({
    orgs: orgs.map(o => ({
      id: o.id, name: o.name, plan: o.plan?.name ?? o.planKey,
      workspaces: o._count.workspaces, members: o._count.memberships, createdAt: o.createdAt,
      minutesThisPeriod: o.workspaces.reduce((s, w) => s + (usageByWs[w.id]?.minutes ?? 0), 0),
    })),
  });
}
