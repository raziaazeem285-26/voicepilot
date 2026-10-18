// GET /api/workspaces/[wsId]/calls/[callId] — full call detail incl. transcript.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { jsonError } from "@/lib/api";
import { withWorkspace } from "@/lib/tenant";

export async function GET(req: NextRequest, { params }: { params: Promise<{ wsId: string; callId: string }> }) {
  const { wsId, callId } = await params;
  const access = await withWorkspace(req, wsId);
  if (access instanceof NextResponse) return access;
  const call = await prisma.callLog.findFirst({
    where: { id: callId, workspaceId: wsId },
    include: { agent: { select: { id: true, name: true } } },
  });
  if (!call) return jsonError("Call not found", 404);
  return NextResponse.json({ call: { ...call, costEstimateUsd: Number(call.costEstimateUsd) } });
}
