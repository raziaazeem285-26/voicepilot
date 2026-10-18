// Tenant scoping: resolve a workspace to its org and enforce membership.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireOrg, jsonError } from "@/lib/api";
import type { SessionUser } from "@/lib/auth";

export type WorkspaceAccess =
  | { user: SessionUser; workspace: { id: string; orgId: string; name: string; category: string; timezone: string } }
  | NextResponse;

export async function withWorkspace(
  req: NextRequest,
  workspaceId: string,
  allowed: Array<"owner" | "admin" | "member"> = ["owner", "admin", "member"]
): Promise<WorkspaceAccess> {
  const ws = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { id: true, orgId: true, name: true, category: true, timezone: true },
  });
  if (!ws) return jsonError("Workspace not found", 404);
  const access = await requireOrg(req, ws.orgId, allowed);
  if (access instanceof NextResponse) return access;
  return { user: access.user, workspace: ws };
}

/** Enforce a plan limit; returns an error Response when over the limit, else null. */
export async function checkPlanLimit(
  orgId: string,
  kind: "workspaces" | "agents",
  currentCount: number
): Promise<NextResponse | null> {
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    include: { plan: true },
  });
  const plan = org?.plan;
  if (!plan) return null;
  const max = kind === "workspaces" ? plan.maxWorkspaces : plan.maxAgents;
  if (currentCount >= max) {
    return jsonError(
      `Plan limit reached: the ${plan.name} plan allows ${max} ${kind}. Upgrade to add more.`,
      402
    );
  }
  return null;
}
