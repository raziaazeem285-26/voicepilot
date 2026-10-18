"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client-api";
import { Button, Card, Field, Input, PageHeader, Badge } from "@/components/ui";

interface Template { key: string; name: string; category: string; description: string }

export default function NewAgentPage({ params }: { params: Promise<{ wsId: string }> }) {
  const router = useRouter();
  const [wsId, setWsId] = useState("");
  const [templates, setTemplates] = useState<Template[]>([]);
  const [picked, setPicked] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { params.then(p => setWsId(p.wsId)); }, [params]);
  useEffect(() => { api<{ templates: Template[] }>("/api/templates").then(d => setTemplates(d.templates)).catch(() => {}); }, []);

  async function create() {
    if (!picked) { setError("Pick a template to start from."); return; }
    setBusy(true); setError("");
    try {
      const data = await api<{ agent: { id: string } }>(`/api/workspaces/${wsId}/agents/from-template`, {
        method: "POST", body: JSON.stringify({ templateKey: picked, name: name || undefined }),
      });
      router.push(`/app/w/${wsId}/agents/${data.agent.id}`);
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <div>
      <PageHeader title="Create an agent" subtitle="Pick a business template — it's a starting point you can fully customize." />
      <div className="grid gap-4 sm:grid-cols-2">
        {templates.map(t => (
          <button key={t.key} onClick={() => setPicked(t.key)} className="text-left">
            <Card className={`h-full transition ${picked === t.key ? "border-indigo-500 ring-2 ring-indigo-100" : "hover:shadow-md"}`}>
              <div className="flex items-start justify-between">
                <h3 className="font-semibold">{t.name}</h3>
                <Badge tone="blue">{t.category}</Badge>
              </div>
              <p className="mt-1 text-sm text-slate-600">{t.description}</p>
              {picked === t.key && <p className="mt-2 text-sm font-medium text-indigo-600">✓ Selected</p>}
            </Card>
          </button>
        ))}
      </div>
      <Card className="mt-6">
        <div className="flex flex-wrap items-end gap-4">
          <div className="min-w-64 flex-1">
            <Field label="Agent name (optional — defaults to template name)"><Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Sam the dispatcher" /></Field>
          </div>
          <Button onClick={create} disabled={busy || !picked}>{busy ? "Creating…" : "Create agent"}</Button>
        </div>
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        <p className="mt-3 text-xs text-slate-500">Templates are starting points, not promises — e.g. the dental template refuses diagnosis and routes clinical questions to staff.</p>
      </Card>
    </div>
  );
}
