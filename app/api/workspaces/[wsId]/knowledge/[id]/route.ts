// DELETE /api/workspaces/[wsId]/knowledge/[id]
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { jsonError } from "@/lib/api";
import { withWorkspace } from "@/lib/tenant";
import { auditLog } from "@/lib/audit";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ wsId: string; id: string }> }) {
  const { wsId, id } = await params;
  const access = await withWorkspace(req, wsId, ["owner", "admin"]);
  if (access instanceof NextResponse) return access;
  const source = await prisma.knowledgeSource.findFirst({ where: { id, workspaceId: wsId } });
  if (!source) return jsonError("Knowledge source not found", 404);
  await prisma.knowledgeSource.delete({ where: { id } });
  await auditLog({ orgId: access.workspace.orgId, userId: access.user.id, action: "knowledge.delete", entityType: "knowledge", entityId: id });
  return NextResponse.json({ ok: true });
}
