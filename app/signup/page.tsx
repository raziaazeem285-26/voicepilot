"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { BRAND } from "@/lib/config";
import { Button, Card, Field, Input } from "@/components/ui";

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [orgName, setOrgName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password, orgName }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Sign up failed");
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
          <h1 className="mt-2 text-xl font-bold">Create your {BRAND.productName} account</h1>
          <p className="mt-1 text-sm text-slate-500">Free demo · no credit card · simulated calls</p>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <Field label="Your name"><Input required value={name} onChange={e => setName(e.target.value)} placeholder="Jane Smith" /></Field>
          <Field label="Business name"><Input value={orgName} onChange={e => setOrgName(e.target.value)} placeholder="Smith Plumbing Co." /></Field>
          <Field label="Email"><Input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="you@business.com" /></Field>
          <Field label="Password" hint="At least 8 characters"><Input type="password" required minLength={8} value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" /></Field>
          {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          <Button type="submit" disabled={busy} className="w-full">{busy ? "Creating account…" : "Create free account"}</Button>
        </form>
        <p className="mt-4 text-center text-sm text-slate-500">
          Have an account? <Link href="/signin" className="font-medium text-indigo-600 hover:underline">Sign in</Link>
        </p>
      </Card>
    </div>
  );
}
