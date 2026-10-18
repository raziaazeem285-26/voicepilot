// POST /api/demo/call — PUBLIC demo endpoint. No auth, no signup.
// Runs a SIMULATED call against the built-in home-services demo agent.
// Strictly rate-limited; nothing is persisted; every response is labeled simulated.
// Never presents simulated outcomes as live capabilities.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { jsonError, checkRateLimit } from "@/lib/api";
import { runSimulatedCall } from "@/lib/simulator/engine";
import { demoHomeServicesConfig } from "@/lib/demo-config";
import type { AgentConfig } from "@/lib/agent-config";

export async function POST(req: NextRequest) {
  // Strict public rate limit: 10 demo calls per hour per IP.
  const limited = checkRateLimit(req, "demo-call", 10, 3600_000);
  if (limited) return limited;

  let body: { callerScript?: string[]; callerName?: string };
  try { body = await req.json(); } catch { return jsonError("Invalid JSON body"); }
  const callerScript = Array.isArray(body.callerScript)
    ? body.callerScript.map(String).slice(0, 12)
    : [];
  if (callerScript.length === 0) return jsonError("callerScript must contain at least one utterance.");

  // Prefer the DB template; fall back to the bundled config when the database
  // isn't connected yet (production Postgres pending). Either way: simulated.
  let config: AgentConfig;
  try {
    const tpl = await prisma.agentTemplate.findUnique({ where: { key: "home-services" } });
    config = (tpl?.defaultConfig as unknown as AgentConfig) ?? demoHomeServicesConfig();
  } catch {
    config = demoHomeServicesConfig();
  }

  const result = await runSimulatedCall({
    agentConfig: config,
    workspace: { timezone: config.businessHours.timezone },
    knowledge: [],
    callerScript,
    callerName: String(body.callerName ?? "Demo Caller").slice(0, 60),
    direction: "inbound",
    recordingAnswer: "yes",
  });

  return NextResponse.json({
    transcript: result.transcript,
    summary: result.summary,
    outcome: result.outcome,
    durationSec: result.durationSec,
    costEstimateUsd: result.costEstimateUsd,
    aiDisclosed: result.aiDisclosed,
    isSimulated: true,
    simulated: true,
    notice: "Demo only: simulated conversation. No real phone call was placed and nothing was booked with a real business.",
  });
}
