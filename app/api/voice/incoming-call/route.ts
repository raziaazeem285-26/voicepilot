// POST /api/voice/incoming-call — Twilio inbound webhook.
// Validates X-Twilio-Signature, resolves the called number to a
// (workspace, agent) via PhoneNumber, enforces business hours + plan quota,
// and returns TwiML bridging the call into the voice bridge WebSocket.
// DNC lists are NEVER applied to inbound calls (advisor fix) — DNC governs
// outbound marketing only.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { jsonError, checkRateLimit } from "@/lib/api";
import { verifyTwilioSignature, twimlConnectStream, twimlSayHangup, TWIML_CONTENT_TYPE } from "@/lib/voice/twilio";
import { isBusinessOpen } from "@/lib/voice/hours";
import type { AgentConfig } from "@/lib/agent-config";

function twiml(body: string) {
  return new NextResponse(body, { headers: { "Content-Type": TWIML_CONTENT_TYPE } });
}

export async function POST(req: NextRequest) {
  const limited = checkRateLimit(req, "voice-incoming", 30, 60_000);
  if (limited) return limited;

  // Twilio sends application/x-www-form-urlencoded.
  const raw = await req.text();
  const params: Record<string, string> = {};
  for (const [k, v] of new URLSearchParams(raw)) params[k] = v;

  const authToken = process.env.TWILIO_AUTH_TOKEN ?? "";
  const signature = req.headers.get("x-twilio-signature");
  const fullUrl = req.url; // must match the exact public URL configured in Twilio
  if (!verifyTwilioSignature(authToken, signature, fullUrl, params)) {
    // Signature failures are observable via 403s in runtime logs; no org context to audit against.
    return jsonError("Invalid Twilio signature", 403);
  }

  const to = params.To ?? "";
  const from = params.From ?? "";
  const callSid = params.CallSid ?? "";
  if (!to || !callSid) return jsonError("Missing To/CallSid", 400);

  // Resolve number -> workspace + agent (server-side trust anchor).
  const number = await prisma.phoneNumber.findUnique({
    where: { e164: to },
    include: { workspace: { select: { id: true, orgId: true, timezone: true } } },
  });
  if (!number || number.status !== "active") {
    return twiml(twimlSayHangup("Sorry, this number is not currently in service. Goodbye."));
  }
  const agent = number.agentId
    ? await prisma.agent.findFirst({ where: { id: number.agentId, workspaceId: number.workspaceId } })
    : await prisma.agent.findFirst({ where: { workspaceId: number.workspaceId, status: "published" }, orderBy: { updatedAt: "desc" } });
  if (!agent) {
    return twiml(twimlSayHangup("Sorry, no agent is available right now. Please try again later."));
  }
  const config = agent.config as unknown as AgentConfig;

  // Business hours: after-hours callers get a polite message (never silence).
  if (!isBusinessOpen(config.businessHours)) {
    return twiml(
      twimlSayHangup(
        `Thanks for calling ${config.identity.businessName}. We're currently closed. ` +
        `Please call back during business hours, or leave a message after the tone on our website. Goodbye.`
      )
    );
  }

  // Plan quota: hard stop at 100% of monthly minutes.
  const period = new Date().toISOString().slice(0, 7);
  const usage = await prisma.usageRecord.findUnique({
    where: { workspaceId_period: { workspaceId: number.workspaceId, period } },
  });
  const org = await prisma.organization.findUnique({
    where: { id: number.workspace.orgId },
    include: { plan: true },
  });
  if (org?.plan && usage && usage.minutes >= org.plan.includedMinutes) {
    await prisma.auditLog.create({
      data: { orgId: number.workspace.orgId, action: "voice.quota_exceeded", entityType: "workspace", entityId: number.workspaceId, metadata: { callSid } },
    });
    return twiml(twimlSayHangup("Sorry, this line is temporarily unavailable. Please try again later."));
  }

  // NOTE: DNC is intentionally NOT checked here — inbound calls are always
  // answered. DNC/opt-out applies to future outbound follow-ups only.

  const bridgeUrl = process.env.BRIDGE_PUBLIC_URL; // wss://bridge-host/twilio
  if (!bridgeUrl) {
    // No bridge deployed yet: honest fallback instead of a dead stream.
    return twiml(
      twimlSayHangup(
        `Thanks for calling ${config.identity.businessName}. Our AI receptionist is being set up. ` +
        `Please call back shortly. Goodbye.`
      )
    );
  }

  return twiml(
    twimlConnectStream(bridgeUrl, {
      workspaceId: number.workspaceId,
      agentId: agent.id,
      callSid,
      from,
      to,
    })
  );
}
