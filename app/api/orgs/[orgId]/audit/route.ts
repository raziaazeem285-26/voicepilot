// GET /api/orgs/[orgId]/audit — audit logs for one organization.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireOrg } from "@/lib/api";

export async function GET(req: NextRequest, { params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const access = await requireOrg(req, orgId, ["owner", "admin"]);
  if (access instanceof NextResponse) return access;
  const limit = Math.min(200, Math.max(1, Number(req.nextUrl.searchParams.get("limit") ?? 100) || 100));
  const logs = await prisma.auditLog.findMany({
    where: { orgId },
    include: { user: { select: { email: true } } },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return NextResponse.json({ logs });
}
