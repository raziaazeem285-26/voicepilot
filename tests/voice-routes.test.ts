// Integration tests: voice API routes — bridge auth, idempotency, tenant isolation.
// Against voicepilot_test DB. Zero live provider calls.
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { signBridgeRequest } from "@/lib/voice/bridge-auth";
import { defaultAgentConfig } from "@/lib/agent-config";
import { POST as toolPost } from "@/app/api/voice/tool/route";
import { POST as closePost } from "@/app/api/voice/call-closed/route";

const SECRET = "test-bridge-secret-for-voice-routes";
let orgId: string, wsId: string, agentId: string, otherWsId: string;

function req(path: string, body: object, scope: string, secret = SECRET): NextRequest {
  const raw = JSON.stringify(body);
  const headers = signBridgeRequest("POST", path, raw, scope, secret);
  return new NextRequest(`http://localhost${path}`, {
    method: "POST",
    headers: { ...headers, "content-type": "application/json" },
    body: raw,
  });
}

describe("voice routes", () => {
  beforeAll(async () => {
    process.env.BRIDGE_SHARED_SECRET = SECRET;
    await prisma.webhookEvent.deleteMany();
    await prisma.callLog.deleteMany();
    await prisma.agent.deleteMany();
    await prisma.workspace.deleteMany();
    await prisma.membership.deleteMany();
    await prisma.organization.deleteMany();
    await prisma.user.deleteMany();
    await prisma.billingPlan.upsert({
      where: { key: "free" },
      update: {},
      create: { key: "free", name: "Free", priceMonthlyUsd: 0, includedMinutes: 15, overagePerMinUsd: 0, maxWorkspaces: 5, maxAgents: 5, features: {} },
    });
    const user = await prisma.user.create({ data: { email: "voice@test.local", passwordHash: "x" } });
    const org = await prisma.organization.create({ data: { name: "Voice Org", planKey: "free" } });
    orgId = org.id;
    await prisma.membership.create({ data: { userId: user.id, orgId, role: "owner" } });
    const ws = await prisma.workspace.create({ data: { orgId, name: "WS", category: "home-services", timezone: "America/Chicago" } });
    wsId = ws.id;
    const ws2 = await prisma.workspace.create({ data: { orgId, name: "WS2", category: "general", timezone: "America/Chicago" } });
    otherWsId = ws2.id;
    const cfg = defaultAgentConfig();
    cfg.appointmentRules.enabled = true;
    const agent = await prisma.agent.create({
      data: { workspaceId: wsId, name: "Test Agent", status: "published", config: cfg as unknown as object },
    });
    agentId = agent.id;
  });

  afterAll(async () => { await prisma.$disconnect(); });

  it("rejects tool calls with a bad bridge signature (401)", async () => {
    const res = await toolPost(req("/api/voice/tool",
      { workspaceId: wsId, agentId, tool: "check_availability", args: {}, idempotencyKey: "k-bad-sig" },
      "voice:tool", "wrong-secret"));
    expect(res.status).toBe(401);
  });

  it("rejects tool calls with a forged workspaceId (403 tenant mismatch)", async () => {
    const res = await toolPost(req("/api/voice/tool",
      { workspaceId: otherWsId, agentId, tool: "check_availability", args: {}, idempotencyKey: "k-forge" },
      "voice:tool"));
    expect(res.status).toBe(403);
  });

  it("executes a tool call and replays the stored result on retry (idempotent)", async () => {
    const body = { workspaceId: wsId, agentId, tool: "check_availability", args: { count: 2 }, idempotencyKey: "k-idem-1" };
    const first = await toolPost(req("/api/voice/tool", body, "voice:tool"));
    expect(first.status).toBe(200);
    const firstJson = await first.json();
    expect(firstJson.ok).toBe(true);
    expect(firstJson.deduplicated).toBeUndefined();

    const second = await toolPost(req("/api/voice/tool", body, "voice:tool"));
    expect(second.status).toBe(200);
    const secondJson = await second.json();
    expect(secondJson.deduplicated).toBe(true);
    expect(secondJson.ok).toBe(true);

    const events = await prisma.webhookEvent.count({ where: { eventId: "bridge:k-idem-1" } });
    expect(events).toBe(1);
  });

  it("returns 409 when the same idempotency key is in flight", async () => {
    // Simulate in-flight: event row exists but no result yet.
    await prisma.webhookEvent.create({ data: { provider: "bridge", eventId: "bridge:k-inflight", workspaceId: wsId } });
    const res = await toolPost(req("/api/voice/tool",
      { workspaceId: wsId, agentId, tool: "check_availability", args: {}, idempotencyKey: "k-inflight" },
      "voice:tool"));
    expect(res.status).toBe(409);
  });

  it("rejects unknown tools (400)", async () => {
    const res = await toolPost(req("/api/voice/tool",
      { workspaceId: wsId, agentId, tool: "delete_everything", args: {}, idempotencyKey: "k-unknown" },
      "voice:tool"));
    expect(res.status).toBe(400);
  });

  it("rejects call-closed with bad signature (401)", async () => {
    const res = await closePost(req("/api/voice/call-closed",
      { workspaceId: wsId, agentId, callSid: "CA-bad" }, "voice:call-closed", "wrong-secret"));
    expect(res.status).toBe(401);
  });

  it("persists a closed call once even when retried (dedupe by CallSid)", async () => {
    const body = {
      workspaceId: wsId, agentId, callSid: "CA-dedupe-1", direction: "inbound",
      status: "answered", durationSec: 90,
      transcript: [{ role: "caller", text: "my email is bob@example.com" }],
      summary: "Test call", outcome: { type: "faq" }, provider: "mock",
    };
    const first = await closePost(req("/api/voice/call-closed", body, "voice:call-closed"));
    expect(first.status).toBe(200);
    const firstJson = await first.json();
    expect(firstJson.deduplicated).toBe(false);
    expect(firstJson.redactedClasses).toContain("email");

    const second = await closePost(req("/api/voice/call-closed", body, "voice:call-closed"));
    const secondJson = await second.json();
    expect(secondJson.deduplicated).toBe(true);

    const count = await prisma.callLog.count({ where: { providerCallId: "CA-dedupe-1" } });
    expect(count).toBe(1);
    // Transcript was PII-redacted before persistence.
    const call = await prisma.callLog.findUnique({ where: { providerCallId: "CA-dedupe-1" } });
    expect(JSON.stringify(call?.transcript)).toContain("[EMAIL REDACTED]");
  });

  it("marks mock-provider calls as simulated", async () => {
    const body = { workspaceId: wsId, agentId, callSid: "CA-sim-1", durationSec: 30, transcript: [], provider: "mock" };
    await closePost(req("/api/voice/call-closed", body, "voice:call-closed"));
    const call = await prisma.callLog.findUnique({ where: { providerCallId: "CA-sim-1" } });
    expect(call?.isSimulated).toBe(true);
    expect(call?.provider).toBe("mock");
  });
});
