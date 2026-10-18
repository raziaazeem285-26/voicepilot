// GET /api/workspaces/[wsId]/calls — filterable, searchable call history.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { jsonError } from "@/lib/api";
import { withWorkspace } from "@/lib/tenant";

const STATUSES = ["answered", "missed", "failed", "transferred"];
const DIRECTIONS = ["inbound", "outbound"];

export async function GET(req: NextRequest, { params }: { params: Promise<{ wsId: string }> }) {
  const { wsId } = await params;
  const access = await withWorkspace(req, wsId);
  if (access instanceof NextResponse) return access;

  const sp = req.nextUrl.searchParams;
  const status = sp.get("status");
  const direction = sp.get("direction");
  const agentId = sp.get("agentId");
  const search = sp.get("search")?.trim();
  const limit = Math.min(100, Math.max(1, Number(sp.get("limit") ?? 25) || 25));
  const offset = Math.max(0, Number(sp.get("offset") ?? 0) || 0);

  if (status && !STATUSES.includes(status)) return jsonError("Invalid status filter.");
  if (direction && !DIRECTIONS.includes(direction)) return jsonError("Invalid direction filter.");

  const where: Record<string, unknown> = { workspaceId: wsId };
  if (status) where.status = status;
  if (direction) where.direction = direction;
  if (agentId) where.agentId = agentId;
  if (search) {
    where.OR = [
      { summary: { contains: search, mode: "insensitive" } },
      // transcript search: stringify match is not supported; search summary + outcome text
    ];
  }

  const [total, calls] = await Promise.all([
    prisma.callLog.count({ where }),
    prisma.callLog.findMany({
      where,
      include: { agent: { select: { id: true, name: true } } },
      orderBy: { startedAt: "desc" },
      take: limit,
      skip: offset,
    }),
  ]);

  // Optional transcript text search (in-memory over the page; honest about scope)
  let filtered = calls;
  if (search) {
    const q = search.toLowerCase();
    filtered = calls.filter(c =>
      c.summary?.toLowerCase().includes(q) ||
      JSON.stringify(c.transcript).toLowerCase().includes(q) ||
      JSON.stringify(c.outcome).toLowerCase().includes(q)
    );
  }

  return NextResponse.json({
    total,
    calls: filtered.map(c => ({
      id: c.id, agent: c.agent, direction: c.direction, status: c.status,
      startedAt: c.startedAt, durationSec: c.durationSec, summary: c.summary,
      outcome: c.outcome, costEstimateUsd: Number(c.costEstimateUsd), isSimulated: c.isSimulated,
    })),
  });
}
