import { Suspense } from "react";
import AppShell from "./shell";

// The pathname-dependent chrome streams in after prerendering.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-slate-500">Loading…</div>}>
      <AppShell>{children}</AppShell>
    </Suspense>
  );
}
