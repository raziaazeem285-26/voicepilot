"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { BRAND } from "@/lib/config";
import { api, type MeResponse } from "@/lib/client-api";
import { Card, PageHeader, Badge, Button } from "@/components/ui";

type Tab = "orgs" | "users" | "health" | "audit";

export default function AdminPage() {
  const router = useRouter();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [tab, setTab] = useState<Tab>("orgs");
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<MeResponse>("/api/auth/me").then(d => {
      if (!d.user.isPlatformAdmin) { setError("Forbidden: platform admin only."); return; }
      setMe(d);
    }).catch(() => router.push("/signin"));
  }, []);

  useEffect(() => {
    if (!me) return;
    setData(null);
    const paths: Record<Tab, string> = { orgs: "/api/admin/orgs", users: "/api/admin/users", health: "/api/admin/health", audit: "/api/admin/audit" };
    api(paths[tab]).then(setData).catch(e => setError((e as Error).message));
  }, [tab, me]);

  if (error) return <div className="p-8"><p className="text-red-600">{error}</p><Link href="/app" className="text-indigo-600 hover:underline">← Back to app</Link></div>;
  if (!me) return <p className="p-8 text-sm text-slate-500">Loading…</p>;

  return (
    <div className="min-h-full bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <span className="text-2xl">{BRAND.logoEmoji}</span>
            <span className="font-bold">{BRAND.productName} — Admin</span>
            <Badge tone="red">platform admin</Badge>
          </div>
          <Link href="/app" className="text-sm font-medium text-indigo-600 hover:underline">← Back to app</Link>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">
        <PageHeader title="Platform admin" subtitle="Organizations, users, provider status, usage, audit logs. Server-side role enforced." />
        <div className="mb-6 flex gap-2">
          {(["orgs", "users", "health", "audit"] as Tab[]).map(t => (
            <Button key={t} variant={tab === t ? "primary" : "secondary"} onClick={() => setTab(t)}>{t}</Button>
          ))}
        </div>
        {!data ? <p className="text-sm text-slate-500">Loading…</p> : (
          <>
            {tab === "orgs" && (
              <div className="grid gap-4 sm:grid-cols-2">
                {data.orgs.map((o: any) => (
                  <Card key={o.id}>
                    <div className="flex items-center justify-between"><h3 className="font-semibold">{o.name}</h3><Badge tone="indigo">{o.plan}</Badge></div>
                    <p className="mt-1 text-sm text-slate-500">{o.workspaces} workspaces · {o.members} members · {Number(o.minutesThisPeriod).toFixed(1)} min this period</p>
                  </Card>
                ))}
              </div>
            )}
            {tab === "users" && (
              <Card><table className="w-full text-sm">
                <thead><tr className="text-left text-slate-500"><th className="py-2">Email</th><th>Name</th><th>Orgs</th><th>Admin</th><th>Joined</th></tr></thead>
                <tbody>{data.users.map((u: any) => (
                  <tr key={u.id} className="border-t border-slate-100"><td className="py-2">{u.email}</td><td>{u.name ?? "—"}</td><td>{u._count.memberships}</td><td>{u.isPlatformAdmin ? "✓" : "—"}</td><td>{new Date(u.createdAt).toLocaleDateString()}</td></tr>
                ))}</tbody>
              </table></Card>
            )}
            {tab === "health" && (
              <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-3">
                  <Card><p className="text-sm text-slate-500">Users / Orgs</p><p className="text-2xl font-bold">{data.health.users} / {data.health.orgs}</p></Card>
                  <Card><p className="text-sm text-slate-500">Total / failed calls</p><p className="text-2xl font-bold">{data.health.totalCalls} / {data.health.failedCalls}</p></Card>
                  <Card><p className="text-sm text-slate-500">Telephony mode</p><p className="text-lg font-bold text-amber-600">simulated-only</p><p className="text-xs text-slate-500">{data.health.telephonyNote}</p></Card>
                </div>
                <Card><h3 className="mb-2 font-semibold">Recent failures</h3>
                  {data.recentErrors.length === 0 ? <p className="text-sm text-slate-500">None 🎉</p> :
                    <ul className="space-y-1 text-sm">{data.recentErrors.map((e: any) => <li key={e.id} className="font-mono text-xs">{e.id} — {e.summary}</li>)}</ul>}
                </Card>
              </div>
            )}
            {tab === "audit" && (
              <Card><table className="w-full text-sm">
                <thead><tr className="text-left text-slate-500"><th className="py-2">When</th><th>Org</th><th>User</th><th>Action</th><th>Entity</th></tr></thead>
                <tbody>{data.logs.map((l: any) => (
                  <tr key={l.id} className="border-t border-slate-100">
                    <td className="py-2 text-xs">{new Date(l.createdAt).toLocaleString()}</td>
                    <td>{l.org?.name ?? "—"}</td><td className="text-xs">{l.user?.email ?? "—"}</td>
                    <td className="font-mono text-xs">{l.action}</td><td className="text-xs">{l.entityType ?? "—"}</td>
                  </tr>
                ))}</tbody>
              </table></Card>
            )}
          </>
        )}
      </main>
    </div>
  );
}
