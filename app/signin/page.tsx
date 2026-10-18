"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { BRAND } from "@/lib/config";
import { Button, Card, Field, Input } from "@/components/ui";

export default function SigninPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/auth/signin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Sign in failed");
      router.push("/app");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-1 items-center justify-center px-6 py-12">
      <Card className="w-full max-w-md">
        <div className="mb-6 text-center">
          <div className="text-3xl">{BRAND.logoEmoji}</div>
          <h1 className="mt-2 text-xl font-bold">Sign in to {BRAND.productName}</h1>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <Field label="Email"><Input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="you@business.com" /></Field>
          <Field label="Password"><Input type="password" required value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" /></Field>
          {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          <Button type="submit" disabled={busy} className="w-full">{busy ? "Signing in…" : "Sign in"}</Button>
        </form>
        <p className="mt-4 text-center text-sm text-slate-500">
          No account? <Link href="/signup" className="font-medium text-indigo-600 hover:underline">Sign up free</Link>
        </p>
      </Card>
    </div>
  );
}
