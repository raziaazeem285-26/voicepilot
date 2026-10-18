// Admin helpers — platform admin only (User.isPlatformAdmin, server-side).
import { NextRequest, NextResponse } from "next/server";
import { apiUser } from "@/lib/api";
import { jsonError } from "@/lib/api";
import type { SessionUser } from "@/lib/auth";

export async function requirePlatformAdmin(req: NextRequest): Promise<SessionUser | NextResponse> {
  const user = await apiUser(req);
  if (!user) return jsonError("Authentication required", 401);
  if (!user.isPlatformAdmin) return jsonError("Forbidden: platform admin only", 403);
  return user;
}
