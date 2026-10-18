// POST /api/workspaces/[wsId]/providers/[provider]/setup
// Save provider credentials (AES-GCM encrypted at rest) and toggle enabled/live.
// Even with isLive=true, live calls stay disabled until the Phase-2 voice bridge
// exists — the adapter layer refuses with ProviderNotConfigured (honest by design).
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { jsonError, checkRateLimit } from "@/lib/api";
import { withWorkspace } from "@/lib/tenant";
import { encryptJson } from "@/lib/crypto";
import { PROVIDER_SETUP_GUIDES } from "@/lib/providers/stubs";
import { auditLog } from "@/lib/audit";

const KNOWN = ["mock", "twilio", "deepgram", "vapi", "retell"];

export async function POST(req: NextRequest, { params }: { params: Promise<{ wsId: string; provider: string }> }) {
  const limited = checkRateLimit(req, "providers:setup", 20, 60_000);
  if (limited) return limited;
  const { wsId, provider } = await params;
  const access = await withWorkspace(req, wsId, ["owner", "admin"]);
  if (access instanceof NextResponse) return access;
  if (!KNOWN.includes(provider)) return jsonError(`Unknown provider. Known: ${KNOWN.join(", ")}.`);

  let body: { credentials?: Record<string, string>; enabled?: boolean; enableLive?: boolean; confirmLive?: boolean };
  try { body = await req.json(); } catch { return jsonError("Invalid JSON body"); }

  const guide = PROVIDER_SETUP_GUIDES.find(g => g.provider === provider);
  if (provider !== "mock" && guide) {
    const creds = body.credentials ?? {};
    const missing = guide.credentialFields.filter(f => !String(creds[f.key] ?? "").trim());
    if (missing.length > 0 && body.enabled !== false) {
      return jsonError(`Missing credentials: ${missing.map(f => f.label).join(", ")}.`);
    }
  }

  // Live mode requires explicit double confirmation.
  const enableLive = body.enableLive === true && body.confirmLive === true;
  if (body.enableLive === true && body.confirmLive !== true) {
    return jsonError("Enabling live mode requires confirmLive: true (explicit opt-in).");
  }

  let credentialsEnc = "";
  if (body.credentials && Object.keys(body.credentials).length > 0) {
    try {
      credentialsEnc = encryptJson(body.credentials);
    } catch (e) {
      return jsonError("Failed to encrypt credentials: " + (e as Error).message, 500);
    }
  }

  const existing = await prisma.providerConfig.findUnique({ where: { workspaceId_provider: { workspaceId: wsId, provider } } });
  const data = {
    enabled: body.enabled ?? existing?.enabled ?? (provider === "mock"),
    isLive: provider === "mock" ? false : enableLive,
    ...(credentialsEnc ? { credentialsEnc } : {}),
  };
  const saved = existing
    ? await prisma.providerConfig.update({ where: { id: existing.id }, data })
    : await prisma.providerConfig.create({ data: { workspaceId: wsId, provider, credentialsEnc, enabled: data.enabled, isLive: data.isLive } });

  await auditLog({
    orgId: access.workspace.orgId, userId: access.user.id, action: "provider.setup",
    entityType: "provider", entityId: saved.id,
    metadata: { provider, enabled: saved.enabled, isLive: saved.isLive, credentialsSaved: credentialsEnc.length > 0 },
  });

  return NextResponse.json({
    provider: saved.provider, enabled: saved.enabled, isLive: saved.isLive,
    hasCredentials: saved.credentialsEnc.length > 0,
    warning: saved.isLive ? "Live flag set, but live calls remain disabled until the Phase-2 voice bridge is deployed. See docs/LIMITATIONS.md." : undefined,
  });
}
