"use client";
// Typed fetch wrapper for the VoicePilot API.
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error((data as { error?: string }).error || `Request failed (${res.status})`) as Error & { status: number };
    err.status = res.status;
    throw err;
  }
  return data as T;
}

export interface MeResponse {
  user: { id: string; email: string; name: string | null; isPlatformAdmin: boolean };
  orgs: { id: string; name: string; planKey: string; role: string; workspaces: { id: string; name: string; category: string; timezone: string }[] }[];
}
