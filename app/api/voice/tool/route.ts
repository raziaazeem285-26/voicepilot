// POST /api/voice/tool — tool execution for the voice bridge (server-to-server).
// Auth: HMAC-signed bridge request (timestamp + nonce replay protection +
// scoped permissions). The workspaceId/agentId supplied by the bridge are
// RE-VALIDATED server-side: the agent must belong to the workspace, and the
// workspace must belong to an org — a client-supplied workspaceId is never
// proof of access (advisor fix).
// Idempotency: (provider=bridge, eventId=idempotencyKey) is recorded in
// WebhookEvent; retried deliveries replay the stored result instead of
// re-executing the tool (prevents double-booking on retry).
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { jsonError, checkRateLimit } from "@/lib/api";
import { verifyBridgeRequest } from "@/lib/voice/bridge-auth";
import { TOOL_REGISTRY, type ToolContext } from "@/lib/simulator/tools";
import type { AgentConfig } from "@/lib/agent-config";
import { auditLog } from "@/lib/audit";

export async function POST(req: NextRequest) {
  const limited = checkRateLimit(req, "voice-tool", 120, 60_000);
  if (limited) return limited;

  const rawBody = await req.text();
  const auth = verifyBridgeRequest(req.headers, "POST", "/api/voice/tool", rawBody, ["voice:tool"]);
  if (!auth.ok) return jsonError(`Bridge auth failed: ${auth.reason}`, 401);

  let body: {
    workspaceId?: string; agentId?: string; tool?: string;
    args?: Record<string, unknown>; idempotencyKey?: string; callSid?: string;
  };
  try { body = JSON.parse(rawBody); } catch { return jsonError("Invalid JSON body"); }

  const { workspaceId, agentId, tool, args, idempotencyKey, callSid } = body;
  if (!workspaceId || !agentId || !tool || !idempotencyKey) {
    return jsonError("workspaceId, agentId, tool, and idempotencyKey are required");
  }
  const toolDef = TOOL_REGISTRY[tool];
  if (!toolDef) return jsonError(`Unknown tool: ${tool}`, 400);

  // Idempotent replay: same key -> same stored result, no re-execution.
  const prior = await prisma.webhookEvent.findUnique({ where: { eventId: `bridge:${idempotencyKey}` } });
  if (prior?.result) {
    return NextResponse.json({ ...(prior.result as object), deduplicated: true, simulated: true });
  }
  if (prior && !prior.result) {
    // In-flight from another worker: do not double-execute; ask the bridge to retry.
    return jsonError("Tool call already in flight; retry shortly", 409);
  }

  // Server-side re-validation: agent must belong to the claimed workspace.
  const agent = await prisma.agent.findFirst({
    where: { id: agentId, workspaceId },
    include: { workspace: { select: { id: true, orgId: true, timezone: true } } },
  });
  if (!agent) return jsonError("Agent/workspace mismatch or not found", 403);

  const ctx: ToolContext = {
    agentConfig: agent.config as unknown as AgentConfig,
    workspaceId,
    orgId: agent.workspace.orgId,
    now: new Date(),
    existingBookings: [], // persistent calendar integration is Phase D; mock calendar per call
    confirmed: Boolean((args as Record<string, unknown> | undefined)?.confirmed),
  };

  const result = await toolDef.run((args ?? {}) as Record<string, unknown>, ctx);

  await prisma.webhookEvent.create({
    data: {
      provider: "bridge",
      eventId: `bridge:${idempotencyKey}`,
      workspaceId,
      result: { ok: result.ok, data: result.data ?? null, error: result.error ?? null, needsConfirmation: result.needsConfirmation ?? null } as object,
    },
  });

  await auditLog({
    orgId: agent.workspace.orgId,
    action: `tool.${tool}`,
    entityType: "agent",
    entityId: agentId,
    metadata: { callSid: callSid ?? null, ok: result.ok, simulated: true, idempotencyKey },
  });

  return NextResponse.json({ ok: result.ok, data: result.data ?? null, error: result.error ?? null, needsConfirmation: result.needsConfirmation ?? null, simulated: true });
}
