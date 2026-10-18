"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client-api";
import { Button, Card, Field, Input, Textarea, Select, PageHeader, Badge, SimulatedBadge } from "@/components/ui";
import type { AgentConfig } from "@/lib/agent-config";

const ALL_ACTIONS = ["answer_faq", "check_availability", "book_appointment", "take_message", "transfer_to_human"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function AgentBuilderPage({ params }: { params: Promise<{ wsId: string; agentId: string }> }) {
  const router = useRouter();
  const [ids, setIds] = useState<{ wsId: string; agentId: string } | null>(null);
  const [name, setName] = useState("");
  const [status, setStatus] = useState("draft");
  const [cfg, setCfg] = useState<AgentConfig | null>(null);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { params.then(setIds); }, [params]);
  useEffect(() => {
    if (!ids) return;
    api<{ agent: { name: string; status: string; config: AgentConfig } }>(`/api/workspaces/${ids.wsId}/agents/${ids.agentId}`)
      .then(d => { setName(d.agent.name); setStatus(d.agent.status); setCfg(d.agent.config); })
      .catch(e => setError((e as Error).message));
  }, [ids]);

  const set = <K extends keyof AgentConfig>(k: K, v: AgentConfig[K]) =>
    setCfg(c => (c ? { ...c, [k]: v } : c));

  async function save() {
    if (!ids || !cfg) return;
    setBusy(true); setError(""); setSaved("");
    try {
      await api(`/api/workspaces/${ids.wsId}/agents/${ids.agentId}`, {
        method: "PATCH", body: JSON.stringify({ name, config: cfg }),
      });
      setSaved("Saved ✓");
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  async function publish() {
    if (!ids) return;
    setBusy(true); setError("");
    try {
      await save();
      const d = await api<{ agent: { status: string } }>(`/api/workspaces/${ids.wsId}/agents/${ids.agentId}/publish`, { method: "POST" });
      setStatus(d.agent.status);
      setSaved("Published ✓ — the agent is now available for simulated calls.");
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  async function remove() {
    if (!ids || !confirm("Delete this agent? This cannot be undone.")) return;
    await api(`/api/workspaces/${ids.wsId}/agents/${ids.agentId}`, { method: "DELETE" });
    router.push(`/app/w/${ids.wsId}`);
  }

  if (!cfg) return <p className="text-sm text-slate-500">{error || "Loading…"}</p>;

  return (
    <div>
      <PageHeader title="Agent builder"
        subtitle="Every field below controls how the agent behaves in the simulator."
        actions={<>
          <Badge tone={status === "published" ? "green" : "slate"}>{status}</Badge>
          <SimulatedBadge />
          <Link href={`/app/w/${ids!.wsId}/agents/${ids!.agentId}/playground`}><Button>🧪 Test call</Button></Link>
        </>} />

      {error && <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {saved && <p className="mb-4 rounded-lg bg-green-50 p-3 text-sm text-green-700">{saved}</p>}

      <div className="space-y-6">
        <Card>
          <h3 className="mb-4 font-semibold">Identity & purpose</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Agent name"><Input value={name} onChange={e => setName(e.target.value)} /></Field>
            <Field label="Business name"><Input value={cfg.identity.businessName} onChange={e => set("identity", { ...cfg.identity, businessName: e.target.value })} /></Field>
            <Field label="Agent display name"><Input value={cfg.identity.agentName} onChange={e => set("identity", { ...cfg.identity, agentName: e.target.value })} /></Field>
            <Field label="Languages (comma-separated codes)"><Input value={cfg.languages.join(", ")} onChange={e => set("languages", e.target.value.split(",").map(s => s.trim()).filter(Boolean))} /></Field>
          </div>
          <div className="mt-4 grid gap-4">
            <Field label="Purpose"><Input value={cfg.purpose} onChange={e => set("purpose", e.target.value)} /></Field>
            <Field label="System instructions" hint="The core behavior prompt. Be specific about what the agent must never do."><Textarea rows={4} value={cfg.systemInstructions} onChange={e => set("systemInstructions", e.target.value)} /></Field>
            <Field label="Greeting"><Textarea rows={2} value={cfg.greeting} onChange={e => set("greeting", e.target.value)} /></Field>
            <Field label="Closing"><Textarea rows={2} value={cfg.closing} onChange={e => set("closing", e.target.value)} /></Field>
          </div>
        </Card>

        <Card>
          <h3 className="mb-4 font-semibold">Voice</h3>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Voice provider"><Input value={cfg.voice.provider} onChange={e => set("voice", { ...cfg.voice, provider: e.target.value })} /></Field>
            <Field label="Voice ID"><Input value={cfg.voice.voiceId} onChange={e => set("voice", { ...cfg.voice, voiceId: e.target.value })} /></Field>
            <Field label="Speaking style"><Input value={cfg.voice.style} onChange={e => set("voice", { ...cfg.voice, style: e.target.value })} placeholder="professional, warm, …" /></Field>
          </div>
          <p className="mt-2 text-xs text-slate-500">Voice selection is stored for the live voice bridge (Phase 2). The simulator uses text.</p>
        </Card>

        <Card>
          <h3 className="mb-4 font-semibold">Business hours</h3>
          <div className="mb-4 grid gap-4 sm:grid-cols-2">
            <Field label="Timezone"><Input value={cfg.businessHours.timezone} onChange={e => set("businessHours", { ...cfg.businessHours, timezone: e.target.value })} placeholder="America/New_York" /></Field>
            <Field label="Holidays (YYYY-MM-DD, comma-separated)"><Input value={cfg.businessHours.holidays.join(", ")} onChange={e => set("businessHours", { ...cfg.businessHours, holidays: e.target.value.split(",").map(s => s.trim()).filter(Boolean) })} /></Field>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {DAYS.map((d, i) => {
              const win = cfg.businessHours.days[String(i)];
              return (
                <div key={d} className="flex items-center gap-2">
                  <span className="w-10 text-sm font-medium">{d}</span>
                  <Input className="w-24" placeholder="09:00" value={win?.[0] ?? ""} onChange={e => {
                    const v = e.target.value;
                    const days = { ...cfg.businessHours.days };
                    days[String(i)] = v ? [v, win?.[1] ?? "17:00"] : null;
                    set("businessHours", { ...cfg.businessHours, days });
                  }} />
                  <span className="text-slate-400">–</span>
                  <Input className="w-24" placeholder="17:00" value={win?.[1] ?? ""} onChange={e => {
                    const v = e.target.value;
                    const days = { ...cfg.businessHours.days };
                    days[String(i)] = v ? [win?.[0] ?? "09:00", v] : null;
                    set("businessHours", { ...cfg.businessHours, days });
                  }} />
                  <span className="text-xs text-slate-400">empty = closed</span>
                </div>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-slate-500">Booking slots are generated from these hours — the simulator checks real availability against them.</p>
        </Card>

        <Card>
          <h3 className="mb-4 font-semibold">FAQs</h3>
          {cfg.faqs.map((f, i) => (
            <div key={i} className="mb-3 grid gap-2 rounded-lg border border-slate-200 p-3 sm:grid-cols-[1fr_2fr_auto]">
              <Input value={f.q} onChange={e => { const faqs = [...cfg.faqs]; faqs[i] = { ...f, q: e.target.value }; set("faqs", faqs); }} placeholder="Question" />
              <Input value={f.a} onChange={e => { const faqs = [...cfg.faqs]; faqs[i] = { ...f, a: e.target.value }; set("faqs", faqs); }} placeholder="Answer" />
              <Button variant="danger" onClick={() => set("faqs", cfg.faqs.filter((_, j) => j !== i))}>✕</Button>
            </div>
          ))}
          <Button variant="secondary" onClick={() => set("faqs", [...cfg.faqs, { q: "", a: "" }])}>+ Add FAQ</Button>
        </Card>

        <Card>
          <h3 className="mb-4 font-semibold">Qualification questions</h3>
          {cfg.qualificationQuestions.map((q, i) => (
            <div key={q.id} className="mb-3 flex items-center gap-2">
              <Input className="flex-1" value={q.question} onChange={e => { const qs = [...cfg.qualificationQuestions]; qs[i] = { ...q, question: e.target.value }; set("qualificationQuestions", qs); }} placeholder="Question to ask the caller" />
              <label className="flex items-center gap-1 text-xs text-slate-600">
                <input type="checkbox" checked={q.required} onChange={e => { const qs = [...cfg.qualificationQuestions]; qs[i] = { ...q, required: e.target.checked }; set("qualificationQuestions", qs); }} /> required
              </label>
              <Button variant="danger" onClick={() => set("qualificationQuestions", cfg.qualificationQuestions.filter((_, j) => j !== i))}>✕</Button>
            </div>
          ))}
          <Button variant="secondary" onClick={() => set("qualificationQuestions", [...cfg.qualificationQuestions, { id: `q${Date.now()}`, question: "", required: false }])}>+ Add question</Button>
        </Card>

        <Card>
          <h3 className="mb-4 font-semibold">Appointment rules</h3>
          <label className="mb-4 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={cfg.appointmentRules.enabled} onChange={e => set("appointmentRules", { ...cfg.appointmentRules, enabled: e.target.checked })} />
            Enable appointment booking
          </label>
          <div className="grid gap-4 sm:grid-cols-4">
            <Field label="Slot minutes"><Input type="number" min={5} value={cfg.appointmentRules.slotMinutes} onChange={e => set("appointmentRules", { ...cfg.appointmentRules, slotMinutes: Number(e.target.value) })} /></Field>
            <Field label="Lead time (hours)"><Input type="number" min={0} value={cfg.appointmentRules.leadTimeHours} onChange={e => set("appointmentRules", { ...cfg.appointmentRules, leadTimeHours: Number(e.target.value) })} /></Field>
            <Field label="Max days ahead"><Input type="number" min={1} value={cfg.appointmentRules.maxDaysAhead} onChange={e => set("appointmentRules", { ...cfg.appointmentRules, maxDaysAhead: Number(e.target.value) })} /></Field>
            <label className="flex items-center gap-2 text-sm"> <input type="checkbox" checked={cfg.appointmentRules.confirmBeforeBooking} onChange={e => set("appointmentRules", { ...cfg.appointmentRules, confirmBeforeBooking: e.target.checked })} /> Confirm before booking </label>
          </div>
        </Card>

        <Card>
          <h3 className="mb-4 font-semibold">Transfers & escalation</h3>
          <Field label="Transfer conditions (one per line)" hint="When should the agent hand off to a human?"><Textarea rows={3} value={cfg.transferConditions.join("\n")} onChange={e => set("transferConditions", e.target.value.split("\n"))} /></Field>
          <div className="mt-4">
            <p className="mb-2 text-sm font-medium text-slate-700">Escalation contacts</p>
            {cfg.escalationContacts.map((c, i) => (
              <div key={i} className="mb-2 grid gap-2 sm:grid-cols-[1fr_1fr_2fr_auto]">
                <Input value={c.name} placeholder="Name" onChange={e => { const cs = [...cfg.escalationContacts]; cs[i] = { ...c, name: e.target.value }; set("escalationContacts", cs); }} />
                <Input value={c.phone} placeholder="Phone" onChange={e => { const cs = [...cfg.escalationContacts]; cs[i] = { ...c, phone: e.target.value }; set("escalationContacts", cs); }} />
                <Input value={c.when} placeholder="When to escalate" onChange={e => { const cs = [...cfg.escalationContacts]; cs[i] = { ...c, when: e.target.value }; set("escalationContacts", cs); }} />
                <Button variant="danger" onClick={() => set("escalationContacts", cfg.escalationContacts.filter((_, j) => j !== i))}>✕</Button>
              </div>
            ))}
            <Button variant="secondary" onClick={() => set("escalationContacts", [...cfg.escalationContacts, { name: "", phone: "", when: "" }])}>+ Add contact</Button>
          </div>
        </Card>

        <Card>
          <h3 className="mb-4 font-semibold">Actions & guardrails</h3>
          <Field label="Allowed actions">
            <div className="flex flex-wrap gap-3">
              {ALL_ACTIONS.map(a => (
                <label key={a} className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm">
                  <input type="checkbox" checked={cfg.allowedActions.includes(a)}
                    onChange={e => set("allowedActions", e.target.checked ? [...cfg.allowedActions, a] : cfg.allowedActions.filter(x => x !== a))} />
                  {a}
                </label>
              ))}
            </div>
          </Field>
          <div className="mt-4">
            <Field label="Prohibited actions (one per line)" hint="Things the agent must never do — e.g. give medical diagnosis."><Textarea rows={3} value={cfg.prohibitedActions.join("\n")} onChange={e => set("prohibitedActions", e.target.value.split("\n").filter(Boolean))} /></Field>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <Field label="Max call minutes"><Input type="number" min={1} max={60} value={cfg.timeouts.maxCallMinutes} onChange={e => set("timeouts", { ...cfg.timeouts, maxCallMinutes: Number(e.target.value) })} /></Field>
            <Field label="No-response timeout (sec)"><Input type="number" min={3} value={cfg.timeouts.noResponseSeconds} onChange={e => set("timeouts", { ...cfg.timeouts, noResponseSeconds: Number(e.target.value) })} /></Field>
            <Field label="Recording consent">
              <Select value={cfg.recordingConsent} onChange={e => set("recordingConsent", e.target.value as AgentConfig["recordingConsent"])}>
                <option value="ask">Ask the caller</option>
                <option value="always">Always (with notice)</option>
                <option value="never">Never record</option>
              </Select>
            </Field>
          </div>
          <label className="mt-4 flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1" checked={cfg.aiDisclosure} onChange={e => set("aiDisclosure", e.target.checked)} />
            <span><strong>Disclose AI identity</strong> — the agent tells callers it's an AI assistant. Recommended everywhere; required in several jurisdictions.</span>
          </label>
        </Card>

        <div className="flex flex-wrap gap-3">
          <Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save changes"}</Button>
          <Button variant="secondary" onClick={publish} disabled={busy}>Publish</Button>
          <Link href={`/app/w/${ids!.wsId}/agents/${ids!.agentId}/playground`}><Button variant="secondary">🧪 Test in playground</Button></Link>
          <Button variant="danger" onClick={remove}>Delete agent</Button>
        </div>
      </div>
    </div>
  );
}
