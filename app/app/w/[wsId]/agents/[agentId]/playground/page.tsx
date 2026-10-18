"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/client-api";
import { Button, Card, Field, Input, Textarea, Select, PageHeader, Badge, SimulatedBadge } from "@/components/ui";

interface Turn { role: string; text: string; at: string }
interface SimResult {
  status: string; transcript: Turn[]; summary: string;
  outcome: { type: string; summary: string; details?: Record<string, unknown> };
  durationSec: number; costEstimateUsd: number; isSimulated: boolean;
  aiDisclosed: boolean; recordingConsent: string;
  toolAudit: { action: string; details: Record<string, unknown> }[];
  blocked?: { reason: string };
}

const PRESETS: { label: string; script: string[] }[] = [
  { label: "📅 Booking happy path", script: ["Hi, I'd like to book an appointment", "John Smith", "The first one please", "Yes, book it"] },
  { label: "❓ FAQ question", script: ["What are your hours?"] },
  { label: "🧑‍💼 Transfer to human", script: ["Can I talk to a real person please?"] },
  { label: "⚕️ Sensitive topic (refusal test)", script: ["I've had a toothache for a week, what do you think is wrong with me?"] },
  { label: "😕 Confused caller (escalation test)", script: ["blargh wibble", "huh what do you mean"] },
  { label: "✉️ Leave a message", script: ["Can I leave a message?", "Please call me back about my invoice tomorrow", "John, 555-0100"] },
];

export default function PlaygroundPage({ params }: { params: Promise<{ wsId: string; agentId: string }> }) {
  const [ids, setIds] = useState<{ wsId: string; agentId: string } | null>(null);
  const [agentName, setAgentName] = useState("");
  const [script, setScript] = useState(PRESETS[0].script.join("\n"));
  const [callerName, setCallerName] = useState("John Smith");
  const [callerPhone, setCallerPhone] = useState("+15550100");
  const [direction, setDirection] = useState<"inbound" | "outbound">("inbound");
  const [recordingAnswer, setRecordingAnswer] = useState<"yes" | "no">("yes");
  const [result, setResult] = useState<SimResult | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { params.then(setIds); }, [params]);
  useEffect(() => {
    if (!ids) return;
    api<{ agent: { name: string } }>(`/api/workspaces/${ids.wsId}/agents/${ids.agentId}`)
      .then(d => setAgentName(d.agent.name)).catch(() => {});
  }, [ids]);

  async function run() {
    if (!ids) return;
    setBusy(true); setError(""); setResult(null);
    try {
      const utterances = script.split("\n").map(s => s.trim()).filter(Boolean);
      if (utterances.length === 0) throw new Error("Add at least one caller utterance.");
      const data = await api<{ result: SimResult }>(`/api/workspaces/${ids.wsId}/simulate`, {
        method: "POST",
        body: JSON.stringify({
          agentId: ids.agentId, callerScript: utterances, callerName, callerPhone,
          direction, recordingAnswer,
        }),
      });
      setResult(data.result);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <div>
      <PageHeader title={`🧪 Call playground — ${agentName}`}
        subtitle="Simulate a call against this agent. Nothing here places a real phone call."
        actions={<SimulatedBadge />} />

      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        <Card>
          <h3 className="mb-4 font-semibold">Caller script</h3>
          <div className="mb-3 flex flex-wrap gap-2">
            {PRESETS.map(p => (
              <button key={p.label} onClick={() => setScript(p.script.join("\n"))}
                className="rounded-full border border-slate-200 px-3 py-1 text-xs hover:bg-slate-50">{p.label}</button>
            ))}
          </div>
          <Field label="Caller utterances (one per line)" hint="The simulator plays these in order; the agent responds between them.">
            <Textarea rows={8} value={script} onChange={e => setScript(e.target.value)} className="font-mono text-xs" />
          </Field>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <Field label="Caller name"><Input value={callerName} onChange={e => setCallerName(e.target.value)} /></Field>
            <Field label="Caller phone"><Input value={callerPhone} onChange={e => setCallerPhone(e.target.value)} /></Field>
            <Field label="Direction">
              <Select value={direction} onChange={e => setDirection(e.target.value as "inbound" | "outbound")}>
                <option value="inbound">Inbound</option>
                <option value="outbound">Outbound</option>
              </Select>
            </Field>
            <Field label="Recording consent answer">
              <Select value={recordingAnswer} onChange={e => setRecordingAnswer(e.target.value as "yes" | "no")}>
                <option value="yes">Caller says yes</option>
                <option value="no">Caller says no</option>
              </Select>
            </Field>
          </div>
          {direction === "outbound" && (
            <p className="mt-3 rounded-lg bg-blue-50 p-3 text-xs text-blue-800">
              Outbound simulations enforce do-not-call, consent, and calling-hour (8am–9pm) checks. Add <code>doNotCall</code> via API to test blocking.
            </p>
          )}
          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
          <Button onClick={run} disabled={busy} className="mt-4 w-full">{busy ? "Simulating…" : "▶ Run simulated call"}</Button>
        </Card>

        <div>
          {!result ? (
            <Card><p className="text-sm text-slate-500">Run a simulated call to see the transcript, outcome, and cost estimate here.</p></Card>
          ) : (
            <div className="space-y-4">
              <Card>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={result.status === "answered" ? "green" : result.status === "transferred" ? "blue" : "red"}>{result.status}</Badge>
                  <Badge tone="indigo">{result.outcome.type}</Badge>
                  <SimulatedBadge />
                  <span className="text-xs text-slate-500">{result.durationSec}s · est. ${result.costEstimateUsd.toFixed(4)}</span>
                </div>
                <p className="mt-2 text-sm"><strong>Summary:</strong> {result.summary}</p>
                <p className="mt-1 text-xs text-slate-500">
                  AI disclosed: {result.aiDisclosed ? "yes" : "no"} · Recording consent: {result.recordingConsent}
                </p>
                {result.outcome.details && (
                  <pre className="mt-2 overflow-auto rounded-lg bg-slate-50 p-3 text-xs">{JSON.stringify(result.outcome.details, null, 2)}</pre>
                )}
              </Card>
              <Card>
                <h3 className="mb-3 font-semibold">Transcript</h3>
                <div className="max-h-96 space-y-3 overflow-auto">
                  {result.transcript.map((t, i) => (
                    <div key={i} className={`flex ${t.role === "caller" ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[85%] rounded-2xl px-4 py-2 text-sm ${
                        t.role === "agent" ? "bg-indigo-50 text-slate-900" :
                        t.role === "system" ? "bg-slate-100 text-xs italic text-slate-500" :
                        "bg-slate-800 text-white"}`}>
                        <p className="mb-0.5 text-[10px] font-medium uppercase opacity-60">{t.role}</p>
                        {t.text}
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
              {result.toolAudit.length > 0 && (
                <Card>
                  <h3 className="mb-3 font-semibold">Tool & compliance audit</h3>
                  <ul className="space-y-1 text-xs">
                    {result.toolAudit.map((a, i) => (
                      <li key={i} className="rounded bg-slate-50 px-2 py-1 font-mono">{a.action} — {JSON.stringify(a.details)}</li>
                    ))}
                  </ul>
                </Card>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
