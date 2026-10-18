// POST /api/auth/signout — destroy the current session.
import { NextRequest, NextResponse } from "next/server";
import { clearSessionCookieHeader, destroySession, readSessionToken } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const token = readSessionToken(req.headers.get("cookie"));
  if (token) await destroySession(token);
  const res = NextResponse.json({ ok: true });
  res.headers.set("Set-Cookie", clearSessionCookieHeader());
  return res;
}
