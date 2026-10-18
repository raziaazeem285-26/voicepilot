"use client";
import { createContext, useContext, useEffect, useState, Suspense } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { BRAND } from "@/lib/config";
import { api, type MeResponse } from "@/lib/client-api";
import { Badge } from "@/components/ui";

interface AppCtx {
  me: MeResponse | null;
  refresh: () => Promise<void>;
  wsId: string | null;
  setWsId: (id: string | null) => void;
}

const Ctx = createContext<AppCtx>({ me: null, refresh: async () => {}, wsId: null, setWsId: () => {} });
export const useApp = () => useContext(Ctx);

const NAV = [
  { href: "/app", label: "Overview", exact: true },
  { href: "/app/calls", label: "Calls", ws: true },
  { href: "/app/knowledge", label: "Knowledge", ws: true },
  { href: "/app/providers", label: "Providers", ws: true },
  { href: "/app/usage", label: "Usage & Plan", ws: true },
];

function ShellChrome({ children }: { children: React.ReactNode }) {
  const { me, wsId, setWsId } = useApp();
  const router = useRouter();
  const pathname = usePathname();

  // Sync workspace from URL when present
  useEffect(() => {
    const m = pathname.match(/\/app\/w\/([^/]+)/);
    if (m) setWsId(m[1]);
  }, [pathname, setWsId]);

  async function signout() {
    await fetch("/api/auth/signout", { method: "POST" });
    router.push("/");
  }

  const org = me?.orgs[0];
  const workspaces = org?.workspaces ?? [];

  return (
    <div className="flex min-h-full">
      <aside className="flex w-60 shrink-0 flex-col border-r border-slate-200 bg-white">
        <Link href="/app" className="flex items-center gap-2 border-b border-slate-200 px-5 py-4">
          <span className="text-2xl">{BRAND.logoEmoji}</span>
          <span className="font-bold">{BRAND.productName}</span>
        </Link>
        <nav className="flex-1 space-y-1 p-3">
          {NAV.map(n => {
            const href = n.ws ? (wsId ? `/app/w/${wsId}${n.href.replace("/app", "")}` : "/app") : n.href;
            const active = n.exact ? pathname === n.href : pathname.startsWith(n.href);
            return (
              <Link key={n.label} href={href}
                className={`block rounded-lg px-3 py-2 text-sm font-medium ${active ? "bg-indigo-50 text-indigo-700" : "text-slate-600 hover:bg-slate-100"}`}>
                {n.label}
              </Link>
            );
          })}
          {me?.user.isPlatformAdmin && (
            <Link href="/admin" className={`block rounded-lg px-3 py-2 text-sm font-medium ${pathname.startsWith("/admin") ? "bg-indigo-50 text-indigo-700" : "text-slate-600 hover:bg-slate-100"}`}>
              🛠️ Admin
            </Link>
          )}
        </nav>
        <div className="border-t border-slate-200 p-4">
          {org && (
            <div className="mb-2">
              <p className="text-xs text-slate-500">Organization</p>
              <p className="truncate text-sm font-medium">{org.name}</p>
              <Badge tone="indigo">{org.planKey}</Badge>
            </div>
          )}
          {workspaces.length > 0 && (
            <select value={wsId ?? ""} onChange={e => { setWsId(e.target.value); router.push(`/app/w/${e.target.value}`); }}
              className="mb-3 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm">
              {workspaces.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          )}
          <div className="flex items-center justify-between">
            <p className="truncate text-xs text-slate-500">{me?.user.email}</p>
            <button onClick={signout} className="text-xs font-medium text-slate-500 hover:text-slate-800">Sign out</button>
          </div>
        </div>
      </aside>
      <main className="flex-1 p-8">
        <div className="mx-auto max-w-5xl">{children}</div>
      </main>
    </div>
  );
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [wsId, setWsId] = useState<string | null>(null);
  const [orgId, setOrgId] = useState<string | null>(null);

  const refresh = async () => {
    try {
      const data = await api<MeResponse>("/api/auth/me");
      setMe(data);
      if (!orgId && data.orgs[0]) {
        setOrgId(data.orgs[0].id);
        const first = data.orgs[0].workspaces[0];
        if (first) setWsId(first.id);
      }
    } catch (e) {
      if ((e as { status?: number }).status === 401) router.push("/signin");
    }
  };

  useEffect(() => { refresh(); }, []);

  return (
    <Ctx.Provider value={{ me, refresh, wsId, setWsId }}>
      <Suspense fallback={<div className="p-8 text-sm text-slate-500">Loading…</div>}>
        <ShellChrome>{children}</ShellChrome>
      </Suspense>
    </Ctx.Provider>
  );
}
