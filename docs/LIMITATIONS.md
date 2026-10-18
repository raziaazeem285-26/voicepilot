# Limitations — what's real vs mocked

Read this before demoing VoicePilot to anyone. Nothing here is hidden; every
mock is labeled in the UI with a "Simulated" badge and `isSimulated: true` in
the data.

## Real vs mocked

| Capability | Status | Notes |
|---|---|---|
| Multi-tenant orgs/workspaces, roles | **Real** | `withWorkspace` scoping; 7 tenant-isolation tests |
| Session auth (bcrypt, httpOnly cookies, 30-day TTL) | **Real** | Custom implementation; `Secure` flag in production |
| Agent builder, templates (10), publish flow | **Real** | Publish validation enforced (`validateAgentConfig`) |
| Simulated call playground | **Real logic, simulated calls** | Rule-based engine: intents, booking flow, transfers, refusals, tool audit |
| Transcripts, outcomes, summaries | **Simulated** | Generated from scripted caller input, not speech |
| Cost estimates (`$0.029/min`) | **Mock estimate** | DIY-stack figure from research §7.2; not a bill |
| Usage metering + plan limits | **Real** | Per workspace/month; 80%/100% alerts |
| Compliance: AI disclosure, recording consent, DNC (outbound-only), 8am–9pm calling window, sensitive-topic refusals | **Real (in simulator)** | Enforced in `lib/simulator/engine.ts`; blocked calls return reasons |
| AES-256-GCM encryption of stored credentials | **Real** | `lib/crypto.ts`; key from `APP_ENCRYPTION_KEY` |
| Audit logging | **Real** | `auth.signup/signin`, `agent.*`, `call.simulated`, `knowledge.add`, `providers.setup`, `workspace.create` |
| Rate limiting (auth, creates, simulate) | **Real, single-process** | In-memory sliding window; **needs Redis for multi-instance** |
| Provider adapters | **Interfaces + MockProvider real; Twilio/Deepgram/Vapi/Retell = stubs that throw** | See `lib/providers/stubs.ts` for Oct 2026 pricing/ToS notes |
| Live calls, number provisioning, real audio (TTS/STT) | **Code-complete, mock by default** | Bridge runs `MockBridge`; `DeepgramBridge` needs `DEEPGRAM_API_KEY`; telephony methods throw until live-configured |
| Inbound webhooks | **Implemented** | `POST /api/voice/incoming-call` validates Twilio signature, resolves number→workspace, returns TwiML (see WEBHOOKS.md) |
| URL knowledge ingestion | **Not implemented** | Stored with `status:"not-implemented"`; paste text instead |
| Real payments / billing charges | **Not implemented** | `BillingPlan` prices are display data; no Stripe/wallet integration |
| Document/file uploads | **Not implemented** | `document` KB type accepts pasted text only |
| SOC2 / HIPAA | **No** | Not certified, not architected for it; the dental template refuses clinical advice |
| Multi-instance deployment | **Not ready** | Rate limiter is in-memory; sessions are in the DB (fine), but limiters diverge |

## Money

All money fields (`BillingPlan.priceMonthlyUsd`, `overagePerMinUsd`,
`CallLog.costEstimateUsd`, `UsageRecord.providerCost`) are Prisma `Decimal` —
no float arithmetic on currency. The simulator works in plain numbers and
converts at the DB boundary.

## Advisor-review items: fixed vs deferred

**Already fixed in this prototype** (external review, Oct 18):

- ✅ Prisma pinned to **6.19.3** for both `prisma` and `@prisma/client` (no
      release-candidate majors)
- ✅ Money fields use **Decimal**, not Float
- ✅ DNC is **outbound-only** — inbound calls are never DNC-blocked (the
      engine only gates `direction === "outbound"`)
- ✅ Tenant isolation enforced + tested (`tests/tenant-isolation.test.ts`, 7 tests)

**Completed in Phase B/C** (Oct 18):

- ✅ Voice bridge service (`~/workspace/voicepilot-bridge/`): `VoiceSessionBridge`
      interface, fully-working `MockBridge`, code-complete `DeepgramBridge`
      (needs `DEEPGRAM_API_KEY`; WS schemas verified 2026-10-18, re-verify at
      first real call), `dev-client.js` for credential-free testing
- ✅ Voice routes: `POST /api/voice/incoming-call` (Twilio signature validation,
      number→workspace resolution, hours/quota checks, TwiML),
      `POST /api/voice/tool` (HMAC-signed, idempotent, tenant re-validated),
      `POST /api/voice/call-closed` (PII-redacted transcripts, cost estimate,
      dedupe by CallSid), `POST /api/voice/session-config`
- ✅ Signed bridge requests: HMAC-SHA256 + timestamps + nonce replay protection
      + scoped permissions + server-side workspace/agent re-verification
      (`lib/voice/bridge-auth.ts`, 8 tests)
- ✅ Transcript retention: `Workspace.dataRetentionDays` + purge job
      (`lib/voice/retention.ts`); PII redaction (card/CVV/SSN/email/phone) before
      persistence (`lib/voice/redact.ts`, 7 tests)
- ✅ Booking edge cases tested: double-booking prevention (slot re-validation),
      duplicate-webhook idempotency (409 in-flight / replay stored result),
      emergency fallback (gas leak/flooding → immediate human transfer, preempts
      booking flows)
- ✅ Login brute-force protection: per-IP rate limit + per-account lockout
      (5 failures → 15-min lock)
- ✅ Public demo at `/demo` (no signup; simulated home-services agent; badged)
- ✅ Rate card seeded from verified Oct 2026 prices; cost math reads RateCard
      (no price literals in code)

**Still deferred** (see ROADMAP.md):

- ⏳ Live telephony: no Twilio/Deepgram credentials configured; bridge runs mock
- ⏳ Full operating-cost reconciliation against real provider invoices
      (needs live traffic first)
- ⏳ Redis-backed rate limits + nonce store for multi-instance
- ⏳ Password reset flow, CSRF tokens (documented in LIMITATIONS)
- ⏳ Persistent calendar integrations (Google Calendar/Calendy — webhook + email only)
