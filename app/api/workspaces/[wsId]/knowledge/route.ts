// /api/workspaces/[wsId]/knowledge — list / add knowledge sources.
// URL ingestion is NOT implemented: url-type sources are stored with
// status "not-implemented" and an honest message (see docs/LIMITATIONS.md).
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { jsonError, checkRateLimit } from "@/lib/api";
import { withWorkspace } from "@/lib/tenant";
import { auditLog } from "@/lib/audit";

const TYPES = ["faq", "text", "document", "url"];

export async function GET(req: NextRequest, { params }: { params: Promise<{ wsId: string }> }) {
  const { wsId } = await params;
  const access = await withWorkspace(req, wsId);
  if (access instanceof NextResponse) return access;
  const sources = await prisma.knowledgeSource.findMany({
    where: { workspaceId: wsId },
    orderBy: { updatedAt: "desc" },
  });
  return NextResponse.json({ sources });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ wsId: string }> }) {
  const limited = checkRateLimit(req, "kb:add", 30, 60_000);
  if (limited) return limited;
  const { wsId } = await params;
  const access = await withWorkspace(req, wsId, ["owner", "admin"]);
  if (access instanceof NextResponse) return access;

  let body: { type?: string; title?: string; content?: string };
  try { body = await req.json(); } catch { return jsonError("Invalid JSON body"); }
  const type = String(body.type ?? "");
  if (!TYPES.includes(type)) return jsonError(`Type must be one of: ${TYPES.join(", ")}.`);
  const title = String(body.title ?? "").trim();
  const content = String(body.content ?? "");
  if (!title) return jsonError("Title is required.");
  if (type !== "url" && !content.trim()) return jsonError("Content is required for this type.");
  if (content.length > 200_000) return jsonError("Content is too large (max 200k characters).");

  let status = "ready";
  let errorMessage: string | null = null;
  let storedContent = content;
  if (type === "url") {
    status = "not-implemented";
    errorMessage = "URL crawling/ingestion is not implemented in this prototype. Paste the page text as a 'text' source instead.";
    storedContent = String(body.content ?? "").trim() || "(url ingestion pending implementation)";
  }

  const source = await prisma.knowledgeSource.create({
    data: { workspaceId: wsId, type, title, content: storedContent, status, errorMessage },
  });
  await auditLog({ orgId: access.workspace.orgId, userId: access.user.id, action: "knowledge.add", entityType: "knowledge", entityId: source.id, metadata: { type, title, status } });
  return NextResponse.json({ source }, { status: 201 });
}
