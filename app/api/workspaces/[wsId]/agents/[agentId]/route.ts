// /api/workspaces/[wsId]/agents/[agentId] — get / update / delete one agent.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { jsonError } from "@/lib/api";
import { withWorkspace } from "@/lib/tenant";
import { mergeAgentConfig, validateAgentConfig, type AgentConfig } from "@/lib/agent-config";
import { auditLog } from "@/lib/audit";

type P = { params: Promise<{ wsId: string; agentId: string }> };

async function findAgent(wsId: string, agentId: string) {
  return prisma.agent.findFirst({ where: { id: agentId, workspaceId: wsId } });
}

export async function GET(req: NextRequest, { params }: P) {
  const { wsId, agentId } = await params;
  const access = await withWorkspace(req, wsId);
  if (access instanceof NextResponse) return access;
  const agent = await findAgent(wsId, agentId);
  if (!agent) return jsonError("Agent not found", 404);
  return NextResponse.json({ agent });
}

export async function PATCH(req: NextRequest, { params }: P) {
  const { wsId, agentId } = await params;
  const access = await withWorkspace(req, wsId, ["owner", "admin"]);
  if (access instanceof NextResponse) return access;
  const agent = await findAgent(wsId, agentId);
  if (!agent) return jsonError("Agent not found", 404);

  let body: { name?: string; config?: Partial<AgentConfig>; status?: string };
  try { body = await req.json(); } catch { return jsonError("Invalid JSON body"); }

  const data: { name?: string; config?: object; status?: string } = {};
  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (!name) return jsonError("Agent name is required.");
    data.name = name;
  }
  if (body.config !== undefined) {
    const merged = mergeAgentConfig({ ...body.config });
    if (body.name) merged.identity.agentName = String(body.name).trim();
    else merged.identity.agentName = agent.name;
    const errors = validateAgentConfig(merged);
    if (errors.length > 0) return jsonError(errors.join(" "));
    data.config = merged as unknown as object;
  }
  if (body.status !== undefined) {
    if (!["draft", "published", "archived"].includes(body.status)) return jsonError("Invalid status.");
    data.status = body.status;
  }

  const updated = await prisma.agent.update({ where: { id: agent.id }, data });
  await auditLog({ orgId: access.workspace.orgId, userId: access.user.id, action: "agent.update", entityType: "agent", entityId: agent.id, metadata: { fields: Object.keys(data) } });
  return NextResponse.json({ agent: { id: updated.id, name: updated.name, status: updated.status, updatedAt: updated.updatedAt } });
}

export async function DELETE(req: NextRequest, { params }: P) {
  const { wsId, agentId } = await params;
  const access = await withWorkspace(req, wsId, ["owner", "admin"]);
  if (access instanceof NextResponse) return access;
  const agent = await findAgent(wsId, agentId);
  if (!agent) return jsonError("Agent not found", 404);
  await prisma.agent.delete({ where: { id: agent.id } });
  await auditLog({ orgId: access.workspace.orgId, userId: access.user.id, action: "agent.delete", entityType: "agent", entityId: agent.id, metadata: { name: agent.name } });
  return NextResponse.json({ ok: true });
}
