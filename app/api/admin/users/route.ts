// GET /api/admin/users — all users (no password hashes, ever).
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePlatformAdmin } from "@/lib/admin";

export async function GET(req: NextRequest) {
  const admin = await requirePlatformAdmin(req);
  if (admin instanceof NextResponse) return admin;
  const users = await prisma.user.findMany({
    select: { id: true, email: true, name: true, isPlatformAdmin: true, createdAt: true, _count: { select: { memberships: true } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return NextResponse.json({ users });
}
