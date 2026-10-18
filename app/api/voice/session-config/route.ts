// POST /api/voice/session-config — the bridge fetches agent config +
// function definitions at session start (server-to-server, signed).
// Auth: HMAC-signed bridge request (scope voice:session). The agent must
// belong to the claimed workspace; config is never exposed to browsers.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { jsonError, checkRateLimit } from "@/lib/api";
import { verifyBridgeRequest } from "@/lib/voice/bridge-auth";
import { TOOL_REGISTRY } from "@/lib/simulator/tools";

export async function POST(req: NextRequest) {
  const limited = checkRateLimit(req, "voice-session", 120, 60_000);
  if (limited) return limited;

  const rawBody = await req.text();
  const auth = verifyBridgeRequest(req.headers, "POST", "/api/voice/session-config", rawBody, ["voice:session"]);
  if (!auth.ok) return jsonError(`Bridge auth failed: ${auth.reason}`, 401);

  let body: { workspaceId?: string; agentId?: string };
  try { body = JSON.parse(rawBody); } catch { return jsonError("Invalid JSON body"); }
  if (!body.workspaceId || !body.agentId) return jsonError("workspaceId and agentId are required");

  const agent = await prisma.agent.findFirst({
    where: { id: body.agentId, workspaceId: body.workspaceId },
    include: { workspace: { select: { id: true, orgId: true, timezone: true, name: true } } },
  });
  if (!agent) return jsonError("Agent/workspace mismatch or not found", 403);

  const functions = Object.values(TOOL_REGISTRY).map(t => ({
    name: t.name,
    description: t.description,
    parameters: t.parameters,
  }));

  return NextResponse.json({
    agentConfig: agent.config,
    workspace: { id: agent.workspace.id, name: agent.workspace.name, timezone: agent.workspace.timezone },
    functions,
    simulated: true,
  });
}
