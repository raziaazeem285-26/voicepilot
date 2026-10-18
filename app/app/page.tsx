"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useApp } from "./shell";
import { api } from "@/lib/client-api";
import { Button, Card, EmptyState, Field, Input, PageHeader, Badge, Select } from "@/components/ui";

interface Workspace { id: string; name: string; category: string; timezone: string }

export default function OverviewPage() {
  const { me, refresh } = useApp();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [showNew, setShowNew] = useState(false);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("general");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const org = me?.orgs[0];

  async function load() {
    if (!org) return;
    const data = await api<{ workspaces: Workspace[] }>(`/api/orgs/${org.id}/workspaces`);
    setWorkspaces(data.workspaces);
  }
  useEffect(() => { if (org) load(); }, [me]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError("");
    try {
      await api(`/api/orgs/${org!.id}/workspaces`, { method: "POST", body: JSON.stringify({ name, category }) });
      setName(""); setShowNew(false);
      await refresh(); await load();
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <div>
      <PageHeader title={`Welcome${me?.user.name ? `, ${me.user.name}` : ""} 👋`}
        subtitle="Create a business workspace, configure an AI agent from a template, and test it in the simulator."
        actions={<Button onClick={() => setShowNew(true)}>+ New workspace</Button>} />

      {showNew && (
        <Card className="mb-6">
          <form onSubmit={create} className="grid gap-4 sm:grid-cols-3">
            <Field label="Workspace name"><Input required value={name} onChange={e => setName(e.target.value)} placeholder="Smith Plumbing Co." /></Field>
            <Field label="Business category">
              <Select value={category} onChange={e => setCategory(e.target.value)}>
                {["general","home-services","healthcare","real-estate","restaurant","salon","education","sales","ecommerce","support","receptionist"].map(c =>
                  <option key={c} value={c}>{c}</option>)}
              </Select>
            </Field>
            <div className="flex items-end gap-2">
              <Button type="submit" disabled={busy}>{busy ? "Creating…" : "Create"}</Button>
              <Button variant="secondary" type="button" onClick={() => setShowNew(false)}>Cancel</Button>
            </div>
          </form>
          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        </Card>
      )}

      {workspaces.length === 0 ? (
        <EmptyState title="No workspaces yet" hint="Create your first business workspace to get started."
          action={<Button onClick={() => setShowNew(true)}>+ New workspace</Button>} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {workspaces.map(w => (
            <Link key={w.id} href={`/app/w/${w.id}`}>
              <Card className="transition hover:shadow-md">
                <div className="flex items-start justify-between">
                  <h3 className="font-semibold">{w.name}</h3>
                  <Badge tone="blue">{w.category}</Badge>
                </div>
                <p className="mt-1 text-sm text-slate-500">Timezone: {w.timezone}</p>
                <p className="mt-3 text-sm font-medium text-indigo-600">Open workspace →</p>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <Card className="mt-8">
        <h3 className="font-semibold">🧪 How this prototype works</h3>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-slate-600">
          <li>Create a workspace for your business.</li>
          <li>Pick one of 10 templates and configure your AI agent.</li>
          <li>Test it in the <strong>Call playground</strong> — every call is <span className="font-medium text-amber-700">SIMULATED</span>.</li>
          <li>Review outcomes, transcripts, and usage on the dashboard.</li>
        </ol>
        <p className="mt-2 text-sm text-slate-500">Real phone calls stay disabled until a telephony provider is configured (Providers page).</p>
      </Card>
    </div>
  );
}
