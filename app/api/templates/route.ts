// GET /api/templates — list system agent templates.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireApiUser } from "@/lib/api";

export async function GET(req: NextRequest) {
  const maybeUser = await requireApiUser(req);
  if (maybeUser instanceof NextResponse) return maybeUser;
  const templates = await prisma.agentTemplate.findMany({
    where: { isSystem: true },
    select: { key: true, name: true, category: true, description: true },
    orderBy: { name: "asc" },
  });
  return NextResponse.json({ templates });
}
