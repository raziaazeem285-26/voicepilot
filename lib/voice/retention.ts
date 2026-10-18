// Transcript/call retention: Workspace.dataRetentionDays drives a purge.
// Recording OFF does NOT end transcript obligations — transcripts contain PII
// too, so they share the same retention + deletion policy (advisor fix).
// Run daily (cron/edge). Returns counts per workspace for observability.
import { prisma } from "../db";

export interface PurgeResult {
  workspaceId: string;
  callsDeleted: number;
  cutoff: Date;
}

/** Delete CallLogs older than the workspace's retention window. */
export async function purgeExpiredCalls(now = new Date()): Promise<PurgeResult[]> {
  const workspaces = await prisma.workspace.findMany({
    select: { id: true, dataRetentionDays: true },
  });
  const results: PurgeResult[] = [];
  for (const ws of workspaces) {
    const cutoff = new Date(now.getTime() - ws.dataRetentionDays * 86400_000);
    const deleted = await prisma.callLog.deleteMany({
      where: { workspaceId: ws.id, startedAt: { lt: cutoff } },
    });
    // Usage rollups are aggregates (no PII) — kept for billing history.
    results.push({ workspaceId: ws.id, callsDeleted: deleted.count, cutoff });
  }
  return results;
}

/** Delete ALL call data for a workspace (GDPR-style erasure request). */
export async function eraseWorkspaceCalls(workspaceId: string): Promise<number> {
  const deleted = await prisma.callLog.deleteMany({ where: { workspaceId } });
  return deleted.count;
}
