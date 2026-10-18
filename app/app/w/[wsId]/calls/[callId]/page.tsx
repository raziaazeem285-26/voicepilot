"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/client-api";
import { Card, PageHeader, Badge, SimulatedBadge } from "@/components/ui";

export default function CallDetailPage({ params }: { params: Promise<{ wsId: string; callId: string }> }) {
  const [ids, setIds] = useState<{ wsId: string; callId: string } | null>(null);
  const [call, setCall] = useState<any>(null);

  useEffect(() => { params.then(setIds); }, [params]);
  useEffect(() => {
    if (!ids) return;
    api<{ call: any }>(`/api/workspaces/${ids.wsId}/calls/${ids.callId}`).then(d => setCall(d.call)).catch(() => {});
  }, [ids]);

  if (!call) return <p className="text-sm text-slate-500">Loading…</p>;

  return (
    <div>
      <PageHeader title={`Call — ${call.agent?.name ?? ""}`}
        subtitle={new Date(call.startedAt).toLocaleString()}
        actions={<>{call.isSimulated && <SimulatedBadge />}<Link href={`/app/w/${ids!.wsId}/calls`} className="text-sm font-medium text-indigo-600 hover:underline">← Back</Link></>} />
      <Card className="mb-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={call.status === "answered" ? "green" : call.status === "transferred" ? "blue" : "red"}>{call.status}</Badge>
          <Badge tone="slate">{call.direction}</Badge>
          <span className="text-xs text-slate-500">{call.durationSec}s · est. ${Number(call.costEstimateUsd).toFixed(4)}</span>
        </div>
        <p className="mt-2 text-sm"><strong>Summary:</strong> {call.summary}</p>
        <p className="mt-1 text-xs text-slate-500">AI disclosed: {call.aiDisclosed ? "yes" : "no"} · Recording consent: {call.recordingConsent}</p>
        {call.outcome && <pre className="mt-2 overflow-auto rounded-lg bg-slate-50 p-3 text-xs">{JSON.stringify(call.outcome, null, 2)}</pre>}
      </Card>
      <Card>
        <h3 className="mb-3 font-semibold">Transcript</h3>
        <div className="space-y-3">
          {(call.transcript as { role: string; text: string }[]).map((t, i) => (
            <div key={i} className={`flex ${t.role === "caller" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[85%] rounded-2xl px-4 py-2 text-sm ${t.role === "agent" ? "bg-indigo-50" : t.role === "system" ? "bg-slate-100 text-xs italic text-slate-500" : "bg-slate-800 text-white"}`}>
                <p className="mb-0.5 text-[10px] font-medium uppercase opacity-60">{t.role}</p>{t.text}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
