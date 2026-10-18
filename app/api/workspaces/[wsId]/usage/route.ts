// GET /api/workspaces/[wsId]/usage — current-period usage vs plan limits.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { jsonError } from "@/lib/api";
import { withWorkspace } from "@/lib/tenant";

export async function GET(req: NextRequest, { params }: { params: Promise<{ wsId: string }> }) {
  const { wsId } = await params;
  const access = await withWorkspace(req, wsId);
  if (access instanceof NextResponse) return access;

  const period = new Date().toISOString().slice(0, 7);
  const usage = await prisma.usageRecord.findUnique({ where: { workspaceId_period: { workspaceId: wsId, period } } });
  const org = await prisma.organization.findUnique({ where: { id: access.workspace.orgId }, include: { plan: true } });
  const plan = org?.plan;

  const minutes = usage?.minutes ?? 0;
  const providerCost = Number(usage?.providerCost ?? 0);
  const included = plan?.includedMinutes ?? 0;
  const pct = included > 0 ? Math.round((minutes / included) * 100) : 0;

  const statusCounts = await prisma.callLog.groupBy({
    by: ["status"], where: { workspaceId: wsId }, _count: { status: true },
  });

  return NextResponse.json({
    period,
    usage: { minutes: Math.round(minutes * 100) / 100, calls: usage?.calls ?? 0, providerCost: Math.round(providerCost * 10000) / 10000 },
    plan: plan ? {
      key: plan.key, name: plan.name, priceMonthlyUsd: Number(plan.priceMonthlyUsd),
      includedMinutes: plan.includedMinutes, overagePerMinUsd: Number(plan.overagePerMinUsd),
      maxWorkspaces: plan.maxWorkspaces, maxAgents: plan.maxAgents,
    } : null,
    percentUsed: pct,
    alert: pct >= 100 ? "hard-limit" : pct >= 80 ? "warning" : "ok",
    statusCounts: Object.fromEntries(statusCounts.map(s => [s.status, s._count.status])),
  });
}
