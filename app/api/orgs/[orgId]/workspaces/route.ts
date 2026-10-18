// /api/orgs/[orgId]/workspaces — list / create workspaces (plan limit enforced).
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireOrg, jsonError, checkRateLimit } from "@/lib/api";
import { checkPlanLimit } from "@/lib/tenant";
import { auditLog } from "@/lib/audit";

export async function GET(req: NextRequest, { params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const access = await requireOrg(req, orgId);
  if (access instanceof NextResponse) return access;
  const workspaces = await prisma.workspace.findMany({
    where: { orgId },
    select: { id: true, name: true, category: true, timezone: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({ workspaces });
}

const CATEGORIES = ["general", "home-services", "healthcare", "real-estate", "restaurant", "salon", "education", "sales", "ecommerce", "support", "receptionist"];

export async function POST(req: NextRequest, { params }: { params: Promise<{ orgId: string }> }) {
  const limited = checkRateLimit(req, "ws:create", 20, 60_000);
  if (limited) return limited;
  const { orgId } = await params;
  const access = await requireOrg(req, orgId, ["owner", "admin"]);
  if (access instanceof NextResponse) return access;

  const count = await prisma.workspace.count({ where: { orgId } });
  const limitErr = await checkPlanLimit(orgId, "workspaces", count);
  if (limitErr) return limitErr;

  let body: { name?: string; category?: string; timezone?: string };
  try { body = await req.json(); } catch { return jsonError("Invalid JSON body"); }
  const name = String(body.name ?? "").trim();
  if (!name) return jsonError("Workspace name is required.");
  const category = CATEGORIES.includes(String(body.category)) ? String(body.category) : "general";
  const timezone = String(body.timezone ?? "America/New_York");

  const ws = await prisma.workspace.create({
    data: {
      orgId, name, category, timezone,
      providerConfigs: { create: { provider: "mock", enabled: true, isLive: false, credentialsEnc: "" } },
    },
  });
  await auditLog({ orgId, userId: access.user.id, action: "workspace.create", entityType: "workspace", entityId: ws.id, metadata: { name, category } });
  return NextResponse.json({ workspace: { id: ws.id, name: ws.name, category: ws.category, timezone: ws.timezone } }, { status: 201 });
}
