// /api/workspaces/[wsId]/providers — list provider configs + setup guides.
// Secrets are NEVER returned by this API.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { jsonError } from "@/lib/api";
import { withWorkspace } from "@/lib/tenant";
import { PROVIDER_SETUP_GUIDES } from "@/lib/providers/stubs";

export async function GET(req: NextRequest, { params }: { params: Promise<{ wsId: string }> }) {
  const { wsId } = await params;
  const access = await withWorkspace(req, wsId);
  if (access instanceof NextResponse) return access;
  const configs = await prisma.providerConfig.findMany({ where: { workspaceId: wsId } });
  return NextResponse.json({
    providers: configs.map(c => ({
      provider: c.provider,
      enabled: c.enabled,
      isLive: c.isLive,
      hasCredentials: c.credentialsEnc.length > 0,
      updatedAt: c.updatedAt,
    })),
    guides: PROVIDER_SETUP_GUIDES,
    note: "Live telephony is disabled until a provider is configured with real credentials, explicitly enabled, and the voice bridge (Phase 2) is deployed. The mock provider is always available for simulated calls.",
  });
}
