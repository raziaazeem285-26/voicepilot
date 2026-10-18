// POST /api/workspaces/[wsId]/agents/from-template — create an agent from a template.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { jsonError, checkRateLimit } from "@/lib/api";
import { withWorkspace, checkPlanLimit } from "@/lib/tenant";
import { mergeAgentConfig, validateAgentConfig, type AgentConfig } from "@/lib/agent-config";
import { auditLog } from "@/lib/audit";

export async function POST(req: NextRequest, { params }: { params: Promise<{ wsId: string }> }) {
  const limited = checkRateLimit(req, "agents:from-template", 30, 60_000);
  if (limited) return limited;
  const { wsId } = await params;
  const access = await withWorkspace(req, wsId, ["owner", "admin"]);
  if (access instanceof NextResponse) return access;

  const count = await prisma.agent.count({ where: { workspaceId: wsId } });
  const limitErr = await checkPlanLimit(access.workspace.orgId, "agents", count);
  if (limitErr) return limitErr;

  let body: { templateKey?: string; name?: string; businessName?: string };
  try { body = await req.json(); } catch { return jsonError("Invalid JSON body"); }
  const templateKey = String(body.templateKey ?? "");
  if (!templateKey) return jsonError("templateKey is required.");
  const template = await prisma.agentTemplate.findUnique({ where: { key: templateKey } });
  if (!template) return jsonError("Template not found", 404);

  const businessName = String(body.businessName ?? "").trim() || access.workspace.name;
  const name = String(body.name ?? "").trim() || template.name;
  const base = template.defaultConfig as unknown as AgentConfig;
  const config = mergeAgentConfig({
    ...base,
    identity: { businessName, agentName: name },
    greeting: base.greeting.replace(/Acme (Services|Realty|Store)/g, businessName).replace(/Bright Smile Dental|Casa Verde|Glow Studio|Apex Home Services|Bright Future Academy/g, businessName),
  });
  config.identity.agentName = name;
  const errors = validateAgentConfig(config);
  if (errors.length > 0) return jsonError(errors.join(" "));

  const agent = await prisma.agent.create({
    data: { workspaceId: wsId, name, templateKey, config: config as unknown as object },
  });
  await auditLog({ orgId: access.workspace.orgId, userId: access.user.id, action: "agent.create_from_template", entityType: "agent", entityId: agent.id, metadata: { templateKey, name } });
  return NextResponse.json({ agent: { id: agent.id, name: agent.name, status: agent.status } }, { status: 201 });
}
