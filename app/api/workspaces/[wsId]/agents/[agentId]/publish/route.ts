// POST /api/workspaces/[wsId]/agents/[agentId]/publish — publish a draft agent.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { jsonError } from "@/lib/api";
import { withWorkspace } from "@/lib/tenant";
import { validateAgentConfig, type AgentConfig } from "@/lib/agent-config";
import { auditLog } from "@/lib/audit";

export async function POST(req: NextRequest, { params }: { params: Promise<{ wsId: string; agentId: string }> }) {
  const { wsId, agentId } = await params;
  const access = await withWorkspace(req, wsId, ["owner", "admin"]);
  if (access instanceof NextResponse) return access;
  const agent = await prisma.agent.findFirst({ where: { id: agentId, workspaceId: wsId } });
  if (!agent) return jsonError("Agent not found", 404);

  const errors = validateAgentConfig(agent.config as unknown as AgentConfig);
  if (errors.length > 0) return jsonError("Cannot publish: " + errors.join(" "));

  const updated = await prisma.agent.update({ where: { id: agent.id }, data: { status: "published" } });
  await auditLog({ orgId: access.workspace.orgId, userId: access.user.id, action: "agent.publish", entityType: "agent", entityId: agent.id });
  return NextResponse.json({ agent: { id: updated.id, name: updated.name, status: updated.status } });
}
