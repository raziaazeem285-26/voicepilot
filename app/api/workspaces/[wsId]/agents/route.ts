// /api/workspaces/[wsId]/agents — list / create agents (plan limit enforced).
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { jsonError, checkRateLimit } from "@/lib/api";
import { withWorkspace, checkPlanLimit } from "@/lib/tenant";
import { defaultAgentConfig, mergeAgentConfig, validateAgentConfig, type AgentConfig } from "@/lib/agent-config";
import { auditLog } from "@/lib/audit";

export async function GET(req: NextRequest, { params }: { params: Promise<{ wsId: string }> }) {
  const { wsId } = await params;
  const access = await withWorkspace(req, wsId);
  if (access instanceof NextResponse) return access;
  const agents = await prisma.agent.findMany({
    where: { workspaceId: wsId },
    select: { id: true, name: true, status: true, templateKey: true, updatedAt: true, createdAt: true },
    orderBy: { updatedAt: "desc" },
  });
  return NextResponse.json({ agents });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ wsId: string }> }) {
  const limited = checkRateLimit(req, "agents:create", 30, 60_000);
  if (limited) return limited;
  const { wsId } = await params;
  const access = await withWorkspace(req, wsId, ["owner", "admin"]);
  if (access instanceof NextResponse) return access;

  const count = await prisma.agent.count({ where: { workspaceId: wsId } });
  const limitErr = await checkPlanLimit(access.workspace.orgId, "agents", count);
  if (limitErr) return limitErr;

  let body: { name?: string; config?: Partial<AgentConfig>; templateKey?: string };
  try { body = await req.json(); } catch { return jsonError("Invalid JSON body"); }
  const name = String(body.name ?? "").trim();
  if (!name) return jsonError("Agent name is required.");

  const config = body.config ? mergeAgentConfig({ ...body.config, identity: { businessName: access.workspace.name, agentName: name, ...(body.config.identity ?? {}) } }) : defaultAgentConfig(access.workspace.name);
  config.identity.agentName = name;
  const errors = validateAgentConfig(config);
  if (errors.length > 0) return jsonError(errors.join(" "));

  const agent = await prisma.agent.create({
    data: { workspaceId: wsId, name, config: config as unknown as object, templateKey: body.templateKey ?? null },
  });
  await auditLog({ orgId: access.workspace.orgId, userId: access.user.id, action: "agent.create", entityType: "agent", entityId: agent.id, metadata: { name } });
  return NextResponse.json({ agent: { id: agent.id, name: agent.name, status: agent.status } }, { status: 201 });
}
