"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/client-api";
import { Button, Card, EmptyState, PageHeader, Badge, SimulatedBadge } from "@/components/ui";

interface Agent { id: string; name: string; status: string; templateKey: string | null; updatedAt: string }

export default function WorkspacePage({ params }: { params: Promise<{ wsId: string }> }) {
  const [wsId, setWsId] = useState<string>("");
  const [agents, setAgents] = useState<Agent[]>([]);
  const [stats, setStats] = useState<{ calls: number; minutes: number } | null>(null);

  useEffect(() => { params.then(p => setWsId(p.wsId)); }, [params]);
  useEffect(() => {
    if (!wsId) return;
    api<{ agents: Agent[] }>(`/api/workspaces/${wsId}/agents`).then(d => setAgents(d.agents)).catch(() => {});
    api<{ usage: { calls: number; minutes: number } }>(`/api/workspaces/${wsId}/usage`).then(d => setStats(d.usage)).catch(() => {});
  }, [wsId]);

  if (!wsId) return null;

  return (
    <div>
      <PageHeader title="Workspace"
        subtitle="Manage agents, test calls, and monitor activity."
        actions={<>
          <Link href={`/app/w/${wsId}/agents/new`}><Button variant="secondary">+ New agent</Button></Link>
          <Link href={`/app/w/${wsId}/calls`}><Button variant="ghost">Call history</Button></Link>
        </>} />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Card><p className="text-sm text-slate-500">Agents</p><p className="text-2xl font-bold">{agents.length}</p></Card>
        <Card><p className="text-sm text-slate-500">Simulated calls</p><p className="text-2xl font-bold">{stats?.calls ?? "—"}</p></Card>
        <Card><p className="text-sm text-slate-500">Minutes used</p><p className="text-2xl font-bold">{stats ? stats.minutes.toFixed(1) : "—"}</p></Card>
      </div>

      <h2 className="mb-3 text-lg font-semibold">AI Agents</h2>
      {agents.length === 0 ? (
        <EmptyState title="No agents yet" hint="Start from one of 10 business templates — it takes a minute."
          action={<Link href={`/app/w/${wsId}/agents/new`}><Button>+ Create agent</Button></Link>} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {agents.map(a => (
            <Card key={a.id}>
              <div className="flex items-start justify-between">
                <h3 className="font-semibold">{a.name}</h3>
                <div className="flex gap-1">
                  <Badge tone={a.status === "published" ? "green" : "slate"}>{a.status}</Badge>
                  <SimulatedBadge />
                </div>
              </div>
              {a.templateKey && <p className="mt-1 text-xs text-slate-500">From template: {a.templateKey}</p>}
              <div className="mt-4 flex gap-2">
                <Link href={`/app/w/${wsId}/agents/${a.id}`}><Button variant="secondary">Configure</Button></Link>
                <Link href={`/app/w/${wsId}/agents/${a.id}/playground`}><Button>🧪 Test call</Button></Link>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
