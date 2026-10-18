# Roadmap

## Phase 0 — Prototype ✅ DONE (this repo)

Multi-tenant Next.js app, session auth, 10 agent templates, no-code agent
builder, simulated-call playground with compliance enforcement, usage + plan
limits, AES-256-GCM credential storage, audit logging, in-memory rate limits,
provider interfaces with MockProvider + documented stubs, 38 tests green.
**This prototype IS the demo asset** for Phase 1.

## Phase 1 — Validation (next, no new platform code)

Test-first per the research report's Section 11:

- **10 customer interviews** using this prototype as the demo (book through
  the playground; capture reactions, pricing sensitivity, must-have features).
- **5 paid pilots** on the simulated platform if interviews convert — pilots
  get real value from config + simulated testing while the bridge is built.

**Go / no-go gate (research §11):** proceed to Phase 2 only after interviews
confirm willingness to pay and the pilot cohort is signed. If validation fails,
the prototype stays a demo and no voice infrastructure is bought. Explicitly:
**no Twilio/Deepgram spend before this gate.**

## Phase 2 — Voice bridge (on go)

Real telephony, as a **separate long-lived service** (serverless Next.js can't
hold persistent WebSockets):

- Twilio Media Streams ↔ Deepgram Voice Agent API (`$0.075/min` bundled,
  research verdict) + Twilio telephony (`$0.0085/min` inbound, `$0.0140/min`
  outbound, numbers `$1.15/mo`).
- Real adapter implementations behind `lib/providers/types.ts` interfaces;
  `getProviderBundle()` resolves live bundles only when
  `ProviderConfig.enabled && isLive` **and** credentials exist.
- Webhook receiver with per-provider signature verification, rate limits from
  day one, and hardened bridge requests (timestamps, replay protection, scoped
  permissions, server-side tenant re-verification).
- `/api/voice/call-closed` contract writing real `CallLog` rows
  (`isSimulated: false`).

**Do not** enable `isLive` on any provider before the bridge is deployed —
the flag alone changes nothing today (live methods throw).

## Phase 3 — Hardening (before charging real customers)

- Redis-backed rate limits (multi-instance safe)
- Transcript retention/privacy policy + consent surfacing in the UI
- Full auth spec: session rotation, CSRF, password reset, revocation,
  brute-force hardening
- Booking edge cases: double-booking guards, duplicate webhook dedup, barge-in
  during confirmation, emergency fallback scripts
- Full operating-cost model + provider-vs-estimate reconciliation
- WordPress embed widget (signed tokens, domain allow-listing) — see WORDPRESS.md

## Phase 4 — Scale

- DIY cost stack (Twilio/Plivo + Nova-3 STT + TTS router, ~`$0.026/min`) once
  volume justifies it
- Agency/white-label plans activated (note: Vapi ToS prohibits SaaS resale —
  legal clearance required; Deepgram ToS explicitly permits multi-tenant use)
- Multi-region, SOC2 scoping, formal support SLAs

## Phase checklist (stage gates)

| Gate | Criteria to proceed |
|---|---|
| Phase 0 → 1 | Prototype demo-ready: interviews booked; docs (this folder) complete |
| Phase 1 → 2 | 10 interviews done; ≥5 pilots signed with willingness to pay documented; advisor review of this gate |
| Phase 2 → 3 | Bridge live in staging; real end-to-end calls on paid Twilio/Deepgram accounts; cost model reconciled |
| Phase 3 → 4 | Security hardening complete; retention policy published; first paying customers retained 60+ days |
