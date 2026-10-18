"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/client-api";
import { Card, PageHeader, Badge } from "@/components/ui";

interface UsageData {
  period: string;
  usage: { minutes: number; calls: number; providerCost: number };
  plan: { key: string; name: string; priceMonthlyUsd: number; includedMinutes: number; overagePerMinUsd: number; maxWorkspaces: number; maxAgents: number } | null;
  percentUsed: number;
  alert: "ok" | "warning" | "hard-limit";
  statusCounts: Record<string, number>;
}

const PLANS = [
  { key: "free", name: "Free Demo", price: "$0", minutes: "15 min", agents: "1 agent" },
  { key: "starter", name: "Starter", price: "$49/mo", minutes: "400 min", agents: "3 agents" },
  { key: "business", name: "Business", price: "$149/mo", minutes: "1,500 min", agents: "10 agents" },
  { key: "agency", name: "Agency", price: "$499/mo", minutes: "5,000 min", agents: "50 agents" },
  { key: "whitelabel", name: "White Label (future)", price: "$999/mo", minutes: "12,000 min", agents: "200 agents" },
];

export default function UsagePage({ params }: { params: Promise<{ wsId: string }> }) {
  const [wsId, setWsId] = useState("");
  const [data, setData] = useState<UsageData | null>(null);

  useEffect(() => { params.then(p => setWsId(p.wsId)); }, [params]);
  useEffect(() => {
    if (wsId) api<UsageData>(`/api/workspaces/${wsId}/usage`).then(setData).catch(() => {});
  }, [wsId]);

  if (!data) return <p className="text-sm text-slate-500">Loading…</p>;

  const bar = data.alert === "hard-limit" ? "bg-red-500" : data.alert === "warning" ? "bg-amber-500" : "bg-indigo-500";

  return (
    <div>
      <PageHeader title="Usage & plan" subtitle={`Billing period: ${data.period}`} />
      {data.alert !== "ok" && (
        <div className={`mb-4 rounded-lg p-4 text-sm ${data.alert === "hard-limit" ? "bg-red-50 text-red-800" : "bg-amber-50 text-amber-800"}`}>
          {data.alert === "hard-limit"
            ? "⚠️ You've used 100%+ of your plan's included minutes. New simulated calls still work in this prototype, but a production plan would enforce a hard stop or overage billing here."
            : "⚠️ You've used over 80% of your plan's included minutes."}
        </div>
      )}
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Card><p className="text-sm text-slate-500">Minutes used</p><p className="text-2xl font-bold">{data.usage.minutes.toFixed(1)} <span className="text-sm font-normal text-slate-500">/ {data.plan?.includedMinutes ?? "—"}</span></p>
          <div className="mt-2 h-2 rounded-full bg-slate-100"><div className={`h-2 rounded-full ${bar}`} style={{ width: `${Math.min(100, data.percentUsed)}%` }} /></div>
          <p className="mt-1 text-xs text-slate-500">{data.percentUsed}% of plan</p></Card>
        <Card><p className="text-sm text-slate-500">Calls</p><p className="text-2xl font-bold">{data.usage.calls}</p>
          <div className="mt-2 flex gap-2 text-xs">{Object.entries(data.statusCounts).map(([s, n]) => <Badge key={s} tone="slate">{s}: {n}</Badge>)}</div></Card>
        <Card><p className="text-sm text-slate-500">Est. provider cost</p><p className="text-2xl font-bold">${data.usage.providerCost.toFixed(4)}</p>
          <p className="mt-1 text-xs text-slate-500">At mock rate $0.029/min (simulated)</p></Card>
      </div>

      <h2 className="mb-3 text-lg font-semibold">Plans</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {PLANS.map(p => (
          <Card key={p.key} className={data.plan?.key === p.key ? "border-indigo-500 ring-2 ring-indigo-100" : ""}>
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">{p.name}</h3>
              {data.plan?.key === p.key && <Badge tone="indigo">current</Badge>}
            </div>
            <p className="mt-1 text-xl font-bold text-indigo-600">{p.price}</p>
            <p className="mt-1 text-sm text-slate-500">{p.minutes} · {p.agents}</p>
          </Card>
        ))}
      </div>
      <p className="mt-4 text-sm text-slate-500">Plan changes are handled by the platform admin in this prototype — no real payments are processed. Overage is billed per plan rate once live billing is connected.</p>
    </div>
  );
}
