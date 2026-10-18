// GET /api/auth/me — current user + organizations + workspaces.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { apiUser } from "@/lib/api";
import { jsonError } from "@/lib/api";

export async function GET(req: NextRequest) {
  const user = await apiUser(req);
  if (!user) return jsonError("Authentication required", 401);
  const memberships = await prisma.membership.findMany({
    where: { userId: user.id },
    include: {
      org: {
        select: {
          id: true, name: true, planKey: true,
          workspaces: { select: { id: true, name: true, category: true, timezone: true } },
        },
      },
    },
  });
  return NextResponse.json({
    user,
    orgs: memberships.map(m => ({ ...m.org, role: m.role })),
  });
}
