"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/client-api";
import { Button, Card, Field, Input, PageHeader, Badge, SimulatedBadge } from "@/components/ui";

interface ProviderState { provider: string; enabled: boolean; isLive: boolean; hasCredentials: boolean }
interface Guide {
  provider: string; displayName: string;
  credentialFields: { key: string; label: string; hint: string }[];
  docsUrl: string; costNotes: string; termsNotes: string; recommendedFor: string;
}

export default function ProvidersPage({ params }: { params: Promise<{ wsId: string }> }) {
  const [wsId, setWsId] = useState("");
  const [providers, setProviders] = useState<ProviderState[]>([]);
  const [guides, setGuides] = useState<Guide[]>([]);
  const [note, setNote] = useState("");
  const [creds, setCreds] = useState<Record<string, Record<string, string>>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => { params.then(p => setWsId(p.wsId)); }, [params]);
  useEffect(() => { load(); }, [wsId]);

  function load() {
    if (wsId) api<{ providers: ProviderState[]; guides: Guide[]; note: string }>(`/api/workspaces/${wsId}/providers`)
      .then(d => { setProviders(d.providers); setGuides(d.guides); setNote(d.note); }).catch(() => {});
  }

  const stateOf = (p: string) => providers.find(x => x.provider === p);

  async function save(p: string, enableLive: boolean) {
    setBusy(p); setError("");
    try {
      if (enableLive && !confirm("Enable LIVE mode? Live calls are still disabled until the Phase-2 voice bridge is deployed. This only stores the flag + credentials.")) {
        setBusy(null); return;
      }
      await api(`/api/workspaces/${wsId}/providers/${p}/setup`, {
        method: "POST",
        body: JSON.stringify({
          credentials: creds[p] ?? {},
          enabled: true,
          enableLive,
          confirmLive: enableLive,
        }),
      });
      setCreds(c => ({ ...c, [p]: {} }));
      load();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(null); }
  }

  return (
    <div>
      <PageHeader title="Providers" subtitle="Voice, telephony, and orchestration providers. Mock is active by default." actions={<SimulatedBadge />} />
      {note && <p className="mb-4 rounded-lg bg-blue-50 p-3 text-sm text-blue-800">{note}</p>}
      {error && <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      <Card className="mb-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold">Mock provider</h3>
            <p className="text-sm text-slate-500">Fully simulated calls for testing. Live telephony is impossible through the mock by design.</p>
          </div>
          <Badge tone="green">{stateOf("mock")?.enabled ? "active" : "inactive"}</Badge>
        </div>
      </Card>

      {guides.map(g => {
        const st = stateOf(g.provider);
        const vals = creds[g.provider] ?? {};
        return (
          <Card key={g.provider} className="mb-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold">{g.displayName}</h3>
                <p className="text-sm text-slate-500">{g.recommendedFor}</p>
              </div>
              <div className="flex gap-1">
                {st?.hasCredentials && <Badge tone="blue">credentials saved</Badge>}
                <Badge tone={st?.isLive ? "amber" : "slate"}>{st?.isLive ? "live flag set" : "not live"}</Badge>
              </div>
            </div>
            <div className="mt-3 grid gap-2 text-sm">
              <p><strong>Cost:</strong> {g.costNotes}</p>
              <p><strong>Terms:</strong> {g.termsNotes}</p>
              <p><a href={g.docsUrl} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline">Official docs ↗</a></p>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {g.credentialFields.map(f => (
                <Field key={f.key} label={f.label} hint={f.hint}>
                  <Input type="password" value={vals[f.key] ?? ""} placeholder={st?.hasCredentials ? "•••••••• (saved)" : ""}
                    onChange={e => setCreds(c => ({ ...c, [g.provider]: { ...(c[g.provider] ?? {}), [f.key]: e.target.value } }))} />
                </Field>
              ))}
            </div>
            <div className="mt-3 flex gap-2">
              <Button variant="secondary" disabled={busy === g.provider} onClick={() => save(g.provider, false)}>
                {busy === g.provider ? "Saving…" : "Save credentials"}
              </Button>
              <Button variant="secondary" disabled={busy === g.provider} onClick={() => save(g.provider, true)}>
                Save + request live mode
              </Button>
            </div>
            <p className="mt-2 text-xs text-slate-500">Credentials are AES-256-GCM encrypted at rest and never sent to the browser.</p>
          </Card>
        );
      })}
    </div>
  );
}
