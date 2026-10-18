// GET /api/admin/health — provider status overview + system health.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePlatformAdmin } from "@/lib/admin";

export async function GET(req: NextRequest) {
  const admin = await requirePlatformAdmin(req);
  if (admin instanceof NextResponse) return admin;
  const [users, orgs, calls, liveProviders, failedCalls] = await Promise.all([
    prisma.user.count(),
    prisma.organization.count(),
    prisma.callLog.count(),
    prisma.providerConfig.count({ where: { provider: { not: "mock" }, isLive: true } }),
    prisma.callLog.count({ where: { status: "failed" } }),
  ]);
  const recentErrors = await prisma.callLog.findMany({
    where: { status: "failed" },
    orderBy: { startedAt: "desc" },
    take: 5,
    select: { id: true, workspaceId: true, startedAt: true, summary: true },
  });
  return NextResponse.json({
    health: {
      users, orgs, totalCalls: calls, failedCalls,
      liveProviderConfigs: liveProviders,
      telephonyMode: "simulated-only",
      telephonyNote: "All calls are simulated. Live telephony requires the Phase-2 voice bridge.",
      db: "ok",
    },
    recentErrors,
  });
}
