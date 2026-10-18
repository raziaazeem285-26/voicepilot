"use client";
// Public demo: try a simulated AI receptionist call. No signup.
// Every response is labeled SIMULATED; no real call is placed.
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { BRAND } from "@/lib/config";
import { Button, Input, Badge, SimulatedBadge } from "@/components/ui";

interface Turn { role: string; text: string; at: string }

const PRESETS: { label: string; script: string[] }[] = [
  { label: "📅 Book a repair visit", script: ["Hi, my kitchen sink is leaking and I need someone to fix it", "1", "Yes, book it"] },
  { label: "❓ Ask about pricing", script: ["How much does a service visit cost?"] },
  { label: "🧑‍💼 Talk to a human", script: ["Can I speak to a real person please?"] },
  { label: "🚨 Report an emergency", script: ["There's a gas leak in my basement!"] },
];

export default function DemoPage() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [script, setScript] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [outcome, setOutcome] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [turns, busy]);

  async function send(nextScript: string[]) {
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/demo/call", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ callerScript: nextScript, callerName: "Demo Caller" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Demo call failed");
      setTurns(data.transcript);
      setScript(nextScript);
      setOutcome(data.outcome?.summary || "");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function sendMessage(text: string) {
    const t = text.trim();
    if (!t || busy) return;
    setInput("");
    send([...script, t]);
  }

  function runPreset(p: { script: string[] }) {
    if (busy) return;
    setTurns([]); setOutcome("");
    send(p.script);
  }

  function reset() {
    setTurns([]); setScript([]); setOutcome(""); setError("");
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <Link href="/" className="flex items-center gap-2">
            <span className="text-xl">{BRAND.logoEmoji}</span>
            <span className="font-bold">{BRAND.productName}</span>
          </Link>
          <div className="flex items-center gap-2">
            <SimulatedBadge />
            <Link href="/signup" className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700">
              Build your own
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <strong>🧪 Live demo — simulated call.</strong> You're chatting with a demo AI receptionist for
          a fictional plumbing company ("Apex Home Services"). <strong>No real phone call is placed</strong>,
          nothing is booked with a real business, and no audio is generated. Try a scenario below or type freely.
        </div>

        <div className="mb-4 flex flex-wrap gap-2">
          {PRESETS.map(p => (
            <button key={p.label} onClick={() => runPreset(p)} disabled={busy}
              className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium hover:bg-slate-50 disabled:opacity-50">
              {p.label}
            </button>
          ))}
          {turns.length > 0 && (
            <button onClick={reset} disabled={busy} className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs hover:bg-slate-50">
              ↺ Start over
            </button>
          )}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center gap-2 border-b border-slate-100 pb-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-100 text-lg">🤖</span>
            <div>
              <p className="text-sm font-semibold">Sam — AI receptionist, Apex Home Services</p>
              <p className="flex items-center gap-1 text-xs text-slate-500">
                <Badge tone="amber">SIMULATED</Badge> demo line · not a real phone call
              </p>
            </div>
          </div>

          <div className="max-h-[420px] min-h-[200px] space-y-3 overflow-y-auto py-2">
            {turns.length === 0 && !busy && (
              <p className="py-8 text-center text-sm text-slate-400">
                Pick a scenario above, or type a message below to start the simulated call.
              </p>
            )}
            {turns.filter(t => t.role !== "system").map((t, i) => (
              <div key={i} className={`flex ${t.role === "caller" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${
                  t.role === "caller" ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-800"
                }`}>
                  {t.text}
                </div>
              </div>
            ))}
            {busy && (
              <div className="flex justify-start">
                <div className="rounded-2xl bg-slate-100 px-4 py-2 text-sm text-slate-500">Sam is typing…</div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {outcome && (
            <p className="mt-3 rounded-lg bg-slate-50 p-2 text-xs text-slate-600">
              <strong>Call outcome (simulated):</strong> {outcome}
            </p>
          )}
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

          <form onSubmit={e => { e.preventDefault(); sendMessage(input); }} className="mt-3 flex gap-2">
            <Input value={input} onChange={e => setInput(e.target.value)} placeholder="Type as the caller…" disabled={busy} maxLength={300} />
            <Button type="submit" disabled={busy || !input.trim()}>Send</Button>
          </form>
        </div>

        <p className="mt-4 text-center text-xs text-slate-500">
          This demo runs entirely on the mock call engine. Real deployments use Twilio + Deepgram
          with AI disclosure, consent, and human handoff — <Link href="/signup" className="text-indigo-600 underline">create an account</Link> to
          configure your own agent.
        </p>
      </main>
    </div>
  );
}
