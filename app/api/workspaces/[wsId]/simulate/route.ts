// POST /api/workspaces/[wsId]/simulate — run a SIMULATED call through the mock engine.
// Nothing here touches real telephony. The result is always labeled simulated
// and is persisted to CallLog + UsageRecord for dashboard/testing.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { jsonError, checkRateLimit } from "@/lib/api";
import { withWorkspace } from "@/lib/tenant";
import { runSimulatedCall } from "@/lib/simulator/engine";
import type { AgentConfig } from "@/lib/agent-config";
import { auditLog } from "@/lib/audit";

export async function POST(req: NextRequest, { params }: { params: Promise<{ wsId: string }> }) {
  const limited = checkRateLimit(req, "simulate", 60, 60_000);
  if (limited) return limited;
  const { wsId } = await params;
  const access = await withWorkspace(req, wsId);
  if (access instanceof NextResponse) return access;

  let body: {
    agentId?: string; callerScript?: string[]; callerName?: string; callerPhone?: string;
    direction?: "inbound" | "outbound"; doNotCall?: boolean; hasConsent?: boolean; recordingAnswer?: "yes" | "no";
  };
  try { body = await req.json(); } catch { return jsonError("Invalid JSON body"); }

  const agent = await prisma.agent.findFirst({ where: { id: String(body.agentId ?? ""), workspaceId: wsId } });
  if (!agent) return jsonError("Agent not found", 404);
  const callerScript = Array.isArray(body.callerScript) ? body.callerScript.map(String).slice(0, 40) : [];
  if (callerScript.length === 0) return jsonError("callerScript must contain at least one utterance.");

  const knowledge = await prisma.knowledgeSource.findMany({
    where: { workspaceId: wsId, status: "ready" },
    select: { title: true, content: true, type: true },
  });

  const result = await runSimulatedCall({
    agentConfig: agent.config as unknown as AgentConfig,
    workspace: { timezone: access.workspace.timezone },
    knowledge: knowledge
      .filter(k => k.type === "faq" || k.type === "text")
      .map(k => ({ question: k.title, answer: k.content.slice(0, 2000) })),
    callerScript,
    callerName: body.callerName,
    callerPhone: body.callerPhone,
    direction: body.direction === "outbound" ? "outbound" : "inbound",
    doNotCall: body.doNotCall,
    hasConsent: body.hasConsent,
    recordingAnswer: body.recordingAnswer,
  });

  const call = await prisma.callLog.create({
    data: {
      workspaceId: wsId,
      agentId: agent.id,
      direction: body.direction === "outbound" ? "outbound" : "inbound",
      status: result.status,
      durationSec: result.durationSec,
      transcript: result.transcript as unknown as object,
      summary: result.summary,
      outcome: result.outcome as unknown as object,
      costEstimateUsd: result.costEstimateUsd,
      isSimulated: true,
      aiDisclosed: result.aiDisclosed,
      recordingConsent: result.recordingConsent,
    },
  });

  // Usage metering (per workspace per calendar month)
  const period = new Date().toISOString().slice(0, 7);
  const minutes = result.durationSec / 60;
  await prisma.usageRecord.upsert({
    where: { workspaceId_period: { workspaceId: wsId, period } },
    update: { minutes: { increment: minutes }, calls: { increment: 1 }, providerCost: { increment: result.costEstimateUsd } },
    create: { workspaceId: wsId, period, minutes, calls: 1, providerCost: result.costEstimateUsd },
  });

  await auditLog({
    orgId: access.workspace.orgId, userId: access.user.id, action: "call.simulated",
    entityType: "call", entityId: call.id,
    metadata: { agentId: agent.id, status: result.status, outcome: result.outcome.type, simulated: true },
  });

  return NextResponse.json({ callId: call.id, result }, { status: 201 });
}
