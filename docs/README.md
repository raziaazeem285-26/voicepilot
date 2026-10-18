# VoicePilot AI — Prototype Documentation

**VoicePilot AI** is a multi-tenant AI calling-agent SaaS prototype.
Business owners build voice agents (from 10 system templates), test them in a
simulated-call playground, review transcripts/outcomes/cost estimates, and manage
workspaces, usage, and provider integrations from one dashboard.

> **Honest status:** this is a **working prototype, not a finished product**.
> Every call is **simulated** by a rule-based mock engine
> (`lib/simulator/engine.ts`). There is no real telephony, no real speech
> recognition/synthesis, and no live billing. Provider adapters exist as
> interfaces with a working `MockProvider` and documented stubs for
> Twilio / Deepgram / Vapi / Retell (`lib/providers/stubs.ts`, with Oct 2026
> verified pricing + ToS notes from market research). The prototype's job is
> **customer-validation interviews**: show a prospect how an AI agent would
> behave, capture their reaction, and only then build Phase 2 (real voice).

## Tech stack (pinned)

- Next.js 16.4.2 · React 19 · TypeScript · Tailwind v4
- Prisma **6.19.3** (pinned — do not float majors; see SETUP.md) + PostgreSQL
- Custom session auth: bcrypt passwords, opaque tokens, httpOnly cookies
- Money fields: Prisma `Decimal` (`costEstimateUsd`, plan pricing)
- Secrets: AES-256-GCM (`lib/crypto.ts`, key = `APP_ENCRYPTION_KEY`)
- Tests: vitest — **38 tests passing** (`lib/simulator/*`, `lib/core`, `tests/tenant-isolation`)

Branding lives in `lib/config.ts` (`BRAND` object — rebrand by editing that one file).

## Quickstart

Prereqs: Node 24, PostgreSQL 14+.

```bash
cd ~/workspace/voicepilot
cp .env.example .env          # then fill in DATABASE_URL + APP_ENCRYPTION_KEY
npx prisma migrate deploy     # apply migrations
node prisma/seed.ts           # plans + admin + 10 agent templates (idempotent)
npm run dev -p 3001           # port 3001 — 3000 is usually taken here
```

Default admin login: **`admin@voicepilot.local` / `admin123`** — change immediately
in production (the password is hashed with bcrypt, so it must be reset in the DB).

## User journey

1. **Sign up** at `/signup` → creates your user, an organization (owner role),
   and a "Main business" workspace with the mock provider pre-configured.
2. **Create an agent** at `/app/w/[wsId]/agents/new` — start from a template
   (e.g. Home Services Enquiries, Dental Scheduling) or blank; customize identity,
   greeting, FAQs, qualification questions, business hours, compliance toggles.
3. **Test in the playground** at `/app/w/[wsId]/agents/[agentId]/playground` —
   type a caller script (or use a preset: booking, FAQ, transfer, sensitive-topic
   refusal, confused caller, message-taking), run a simulated call, and read the
   transcript, outcome, tool audit, cost estimate, and compliance flags
   (`aiDisclosed`, `recordingConsent`, `blocked` reasons).
4. **Publish** the agent (draft → published) once the config validates
   (publish requires business name, agent name, greeting, closing, ≥1 language,
   sane call-length/appointment settings).
5. **Review calls** at `/app/w/[wsId]/calls` — transcripts, outcomes, simulated
   cost; **usage** at `/app/w/[wsId]/usage` — minutes/calls/provider-cost vs the
   plan's included minutes with 80%/100% alerts.
6. **Providers** at `/app/w/[wsId]/providers` — today only the mock provider is
   real; saving credentials for Twilio/Deepgram/Vapi/Retell stores them
   encrypted and documents setup costs/terms; live calling stays disabled until
   the Phase-2 voice bridge exists (see LIMITATIONS.md, ROADMAP.md).
7. **Platform admin** at `/admin` (`isPlatformAdmin` users) — orgs, users,
   system health, cross-org audit log.

## Compliance built into the engine

- **AI disclosure**: the agent appends "Just so you know, I'm an AI assistant."
  unless the greeting already says it (`AgentConfig.aiDisclosure`).
- **Recording consent**: `ask` (asks the caller, default `recordingAnswer: "yes"`
  in the playground), `always`, or `never`.
- **Do-not-call**: outbound calls to DNC-flagged numbers are blocked. Inbound
  calls are **never** DNC-blocked — DNC applies to outbound only.
- **Calling hours**: outbound calls only within 8:00–21:00 called-party local
  time (workspace timezone), when no explicit business-hours match.
- **Consent for outbound**: simulated outbound calls without
  `hasConsent: true` are blocked (TCPA-style).
- **Sensitive topics**: medical diagnosis, legal advice, financial advice (and
  per-template prohibitions, e.g. the dental template refuses diagnosis) →
  polite refusal + transfer offer. Audit-logged.

## What's deliberately fake

- Audio: none. The mock TTS returns empty audio; the mock STT returns empty text.
- Phone numbers: provisioning throws; `placeCall` throws.
- Costs: `MOCK_RATE_PER_MIN = $0.029/min` estimate only (DIY-stack figure from
  research §7.2).
- URL knowledge sources: stored with status `not-implemented` — paste page text
  as a `text` source instead.

See `docs/LIMITATIONS.md` for the full real-vs-mocked table.
