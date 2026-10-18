"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/client-api";
import { Card, Field, Input, Select, PageHeader, Badge, SimulatedBadge, EmptyState } from "@/components/ui";

interface CallItem {
  id: string; agent: { id: string; name: string }; direction: string; status: string;
  startedAt: string; durationSec: number; summary: string;
  outcome: { type: string }; costEstimateUsd: number; isSimulated: boolean;
}

export default function CallsPage({ params }: { params: Promise<{ wsId: string }> }) {
  const [wsId, setWsId] = useState("");
  const [calls, setCalls] = useState<CallItem[]>([]);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState("");
  const [direction, setDirection] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => { params.then(p => setWsId(p.wsId)); }, [params]);

  async function load() {
    if (!wsId) return;
    const q = new URLSearchParams({ limit: "50" });
    if (status) q.set("status", status);
    if (direction) q.set("direction", direction);
    if (search) q.set("search", search);
    const d = await api<{ calls: CallItem[]; total: number }>(`/api/workspaces/${wsId}/calls?${q}`);
    setCalls(d.calls); setTotal(d.total);
  }
  useEffect(() => { load(); }, [wsId]);

  return (
    <div>
      <PageHeader title="Call history" subtitle="Every call — simulated for now — with outcomes and transcripts." actions={<SimulatedBadge />} />
      <Card className="mb-4">
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="Search"><Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search transcripts…" /></Field>
          <Field label="Status">
            <Select value={status} onChange={e => setStatus(e.target.value)}>
              <option value="">All</option>
              <option value="answered">Answered</option>
              <option value="transferred">Transferred</option>
              <option value="failed">Failed</option>
              <option value="missed">Missed</option>
            </Select>
          </Field>
          <Field label="Direction">
            <Select value={direction} onChange={e => setDirection(e.target.value)}>
              <option value="">All</option>
              <option value="inbound">Inbound</option>
              <option value="outbound">Outbound</option>
            </Select>
          </Field>
          <div className="flex items-end"><button onClick={load} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">Filter</button></div>
        </div>
      </Card>
      {calls.length === 0 ? (
        <EmptyState title="No calls yet" hint="Run a simulated call from an agent's playground page." />
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-slate-500">{total} call{total === 1 ? "" : "s"}</p>
          {calls.map(c => (
            <Link key={c.id} href={`/app/w/${wsId}/calls/${c.id}`}>
              <Card className="transition hover:shadow-md">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={c.status === "answered" ? "green" : c.status === "transferred" ? "blue" : "red"}>{c.status}</Badge>
                  <Badge tone="slate">{c.direction}</Badge>
                  <Badge tone="indigo">{c.outcome?.type ?? "none"}</Badge>
                  {c.isSimulated && <SimulatedBadge />}
                  <span className="ml-auto text-xs text-slate-500">{new Date(c.startedAt).toLocaleString()} · {c.durationSec}s · ${c.costEstimateUsd.toFixed(4)}</span>
                </div>
                <p className="mt-2 text-sm font-medium">{c.agent.name}</p>
                <p className="text-sm text-slate-600">{c.summary}</p>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
