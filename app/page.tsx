import Link from "next/link";
import { BRAND } from "@/lib/config";

const FEATURES = [
  { emoji: "🧩", title: "10 business templates", text: "Support, receptionist, real estate, dental, restaurant, salon, home services, academy, sales, and order-status — safe starting points, not hard promises." },
  { emoji: "🎛️", title: "No-code agent builder", text: "Configure identity, instructions, voices, business hours, FAQs, qualification questions, transfers, and compliance settings." },
  { emoji: "🧪", title: "Simulated call playground", text: "Test every agent with realistic mock calls — booking flows, transfers, refusals — before any real telephony." },
  { emoji: "📊", title: "Dashboard & usage", text: "Call outcomes, transcripts, cost estimates, and plan-limit alerts in one place." },
  { emoji: "🔌", title: "Provider adapters", text: "Mock today; Twilio + Deepgram voice bridge as the documented path to live calls. No vendor lock-in." },
  { emoji: "🛡️", title: "Compliance-first", text: "AI disclosure, recording consent, do-not-call, and calling-hour enforcement built into the call engine." },
];

const PLANS = [
  { name: "Free Demo", price: "$0", detail: "15 simulated minutes to try everything" },
  { name: "Starter", price: "$49/mo", detail: "400 min included · 3 agents" },
  { name: "Business", price: "$149/mo", detail: "1,500 min included · 10 agents" },
  { name: "Agency", price: "$499/mo", detail: "5,000 min included · 50 agents" },
];

export default function LandingPage() {
  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <span className="text-2xl">{BRAND.logoEmoji}</span>
            <span className="text-lg font-bold">{BRAND.productName}</span>
          </div>
          <div className="flex gap-3">
            <Link href="/signin" className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100">Sign in</Link>
            <Link href="/signup" className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">Get started</Link>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-6">
        <section className="py-16 text-center">
          <p className="mb-4 inline-flex items-center rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800">
            🧪 Validation prototype — all calls are simulated until live telephony is configured
          </p>
          <h1 className="mx-auto max-w-3xl text-4xl font-bold tracking-tight sm:text-5xl">
            {BRAND.productName} — <span className="text-indigo-600">AI phone agents</span> for your business
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-slate-600">
            Never miss another call. Build an AI receptionist that answers FAQs, books appointments,
            qualifies leads, and transfers to your team — test it safely in the simulator first.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href="/demo" className="rounded-lg bg-indigo-600 px-6 py-3 text-sm font-medium text-white hover:bg-indigo-700">🧪 Try the live demo</Link>
            <Link href="/signup" className="rounded-lg border border-slate-300 bg-white px-6 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50">Start free</Link>
            <Link href="/signin" className="rounded-lg px-6 py-3 text-sm font-medium text-slate-600 hover:bg-slate-100">Sign in</Link>
          </div>
          <p className="mt-3 text-xs text-slate-500">No signup needed for the demo — a simulated call with a fictional plumbing company.</p>
        </section>

        <section className="py-8">
          <h2 className="text-center text-2xl font-bold">How it works</h2>
          <div className="mt-6 grid gap-5 sm:grid-cols-3">
            {[
              { n: "1", title: "Configure your agent", text: "Pick a business template, set your greeting, hours, FAQs, and booking rules. AI disclosure is on by default." },
              { n: "2", title: "Test with simulated calls", text: "Run realistic mock calls in the playground — bookings, transfers, refusals, emergencies — before any real telephony." },
              { n: "3", title: "Go live when ready", text: "Connect Twilio + Deepgram through the voice bridge. Every call is logged, costed, and auditable." },
            ].map(s => (
              <div key={s.n} className="rounded-xl border border-slate-200 bg-white p-5 text-center shadow-sm">
                <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-indigo-100 text-lg font-bold text-indigo-700">{s.n}</div>
                <h3 className="mt-3 font-semibold">{s.title}</h3>
                <p className="mt-1 text-sm text-slate-600">{s.text}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="grid gap-5 py-8 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(f => (
            <div key={f.title} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="text-2xl">{f.emoji}</div>
              <h3 className="mt-2 font-semibold">{f.title}</h3>
              <p className="mt-1 text-sm text-slate-600">{f.text}</p>
            </div>
          ))}
        </section>

        <section className="py-12">
          <h2 className="text-center text-2xl font-bold">Simple, honest pricing</h2>
          <p className="mt-2 text-center text-sm text-slate-500">No unlimited traps — every plan has clear minute buckets and overage rates.</p>
          <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {PLANS.map(p => (
              <div key={p.name} className="rounded-xl border border-slate-200 bg-white p-5 text-center shadow-sm">
                <h3 className="font-semibold">{p.name}</h3>
                <p className="mt-2 text-2xl font-bold text-indigo-600">{p.price}</p>
                <p className="mt-1 text-sm text-slate-500">{p.detail}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200 bg-white py-6 text-center text-sm text-slate-500">
        {BRAND.productName} · Prototype — simulated calls only · Contact {BRAND.supportEmail}
      </footer>
    </div>
  );
}
