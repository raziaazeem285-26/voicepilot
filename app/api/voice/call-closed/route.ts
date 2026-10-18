// POST /api/voice/call-closed — the bridge reports a finished call.
// Auth: HMAC-signed bridge request (scope voice:call-closed).
// The transcript is PII-redacted BEFORE persistence (advisor fix).
// Idempotency: providerCallId (Twilio CallSid) is unique — a retried close
// updates the existing record instead of double-logging the call.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { jsonError, checkRateLimit } from "@/lib/api";
import { verifyBridgeRequest } from "@/lib/voice/bridge-auth";
import { redactTranscript } from "@/lib/voice/redact";
import { estimateCallCost } from "@/lib/voice/cost";
import { auditLog } from "@/lib/audit";

export async function POST(req: NextRequest) {
  const limited = checkRateLimit(req, "voice-close", 120, 60_000);
  if (limited) return limited;

  const rawBody = await req.text();
  const auth = verifyBridgeRequest(req.headers, "POST", "/api/voice/call-closed", rawBody, ["voice:call-closed"]);
  if (!auth.ok) return jsonError(`Bridge auth failed: ${auth.reason}`, 401);

  let body: {
    workspaceId?: string; agentId?: string; callSid?: string; streamSid?: string;
    direction?: string; status?: string; durationSec?: number;
    transcript?: { role: string; text: string; at?: string }[];
    summary?: string; outcome?: Record<string, unknown>;
    aiDisclosed?: boolean; recordingConsent?: string; from?: string; to?: string;
    provider?: string;
  };
  try { body = JSON.parse(rawBody); } catch { return jsonError("Invalid JSON body"); }

  const { workspaceId, agentId, callSid } = body;
  if (!workspaceId || !agentId || !callSid) {
    return jsonError("workspaceId, agentId, and callSid are required");
  }
  // Provider allowlist: mock calls stay labeled simulated; anything else must
  // be an explicitly implemented provider.
  const provider = body.provider === "deepgram" ? "deepgram" : "mock";
  const isSimulated = provider === "mock";

  // Server-side re-validation (never trust the bridge's workspaceId alone).
  const agent = await prisma.agent.findFirst({
    where: { id: agentId, workspaceId },
    include: { workspace: { select: { id: true, orgId: true } } },
  });
  if (!agent) return jsonError("Agent/workspace mismatch or not found", 403);

  // Idempotent close: a retried close updates, never duplicates.
  const existing = await prisma.callLog.findUnique({ where: { providerCallId: callSid } });

  const { turns, redactedClasses } = redactTranscript(
    Array.isArray(body.transcript) ? body.transcript : []
  );
  const minutes = Math.max(1 / 60, (body.durationSec ?? 0) / 60);
  const { total: costEstimate } = await estimateCallCost({
    provider: "deepgram",
    voiceMinutes: minutes,
    telephonyMinutes: minutes,
  });

  const data = {
    workspaceId,
    agentId,
    direction: body.direction === "outbound" ? "outbound" : "inbound",
    status: ["answered", "missed", "failed", "transferred"].includes(body.status ?? "") ? body.status! : "answered",
    durationSec: Math.max(0, Math.round(body.durationSec ?? 0)),
    transcript: turns as unknown as object,
    summary: (body.summary ?? "").slice(0, 2000),
    outcome: (body.outcome ?? {}) as object,
    costEstimateUsd: costEstimate,
    provider,
    providerCallId: callSid,
    streamSid: body.streamSid ?? null,
    endedAt: new Date(),
    isSimulated,
    aiDisclosed: body.aiDisclosed ?? true,
    recordingConsent: body.recordingConsent ?? "not-applicable",
  };

  const call = existing
    ? await prisma.callLog.update({ where: { providerCallId: callSid }, data })
    : await prisma.callLog.create({ data });

  if (!existing) {
    const period = new Date().toISOString().slice(0, 7);
    await prisma.usageRecord.upsert({
      where: { workspaceId_period: { workspaceId, period } },
      update: { minutes: { increment: minutes }, calls: { increment: 1 }, providerCost: { increment: costEstimate } },
      create: { workspaceId, period, minutes, calls: 1, providerCost: costEstimate },
    });
  }

  await auditLog({
    orgId: agent.workspace.orgId,
    action: "voice.call_closed",
    entityType: "call",
    entityId: call.id,
    metadata: {
      callSid, status: data.status, durationSec: data.durationSec,
      redactedClasses, deduplicated: Boolean(existing), simulated: isSimulated,
    },
  });

  return NextResponse.json({ ok: true, callId: call.id, deduplicated: Boolean(existing), redactedClasses });
}
