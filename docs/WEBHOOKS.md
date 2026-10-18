# Webhooks

## Current status: NOT LIVE

This prototype has **no inbound webhook routes and no outbound webhooks**.
`MockTelephony.parseInboundWebhook()` returns `null` by design, and every live
telephony method (`placeCall`, `provisionNumber`, `transferCall`) throws. There
is nothing for a provider to call into, and nothing the app emits to providers.

What *does* exist today is the **signature-verification primitive** in
`lib/providers/mock.ts`:

```ts
verifyWebhookSignature(payload: string, signature: string | null, secret: string): boolean
```

- Algorithm: **HMAC-SHA256** of the raw request body, hex-encoded.
- Compared with `crypto.timingSafeEqual` (length-checked first).
- Returns `false` if signature or secret is missing.

The `TelephonyProvider` interface (`lib/providers/types.ts`) already declares
`parseInboundWebhook` and `verifyWebhookSignature`, so a future bridge can wire
in without changing the engine.

## What the Phase-2 bridge must implement

The voice bridge is the **separate long-lived service** (Twilio Media Streams ↔
Deepgram Voice Agent API — see ROADMAP.md), because serverless Next.js cannot
hold persistent WebSockets. It needs:

1. **Inbound webhook receiver** (e.g. `POST /voice/inbound`):
   - Read the provider's signature header (`X-Twilio-Signature` for Twilio —
     note: Twilio uses HMAC-SHA1 with the URL + params, not the hex body form
     above; the bridge must implement per-provider verification) and reject on
     mismatch **before** parsing.
   - Map provider events → `TelephonyProvider` events → engine/tool calls.
   - Resolve the workspace by a configured number/token mapping; re-verify
     tenant server-side (never trust a client-supplied `wsId` alone).
2. **Hardened bridge requests** (advisor review): shared secret alone is
   insufficient — use signed requests with timestamps + replay protection,
   scoped permissions, and server-side workspace/agent re-verification.
3. **Outbound status callbacks** for delivery/completion events, written to
   `CallLog` with `isSimulated: false`.
4. **Rate limiting on webhook paths** — the bridge inherits the
   `lib/rate-limit.ts` pattern (in-memory per instance) until Redis lands in
   Phase 3; webhook endpoints are untrusted-input surfaces and must be limited
   from day one.

## Until then

Do not point Twilio/Deepgram/Vapi/Retell webhook URLs at this app — there are
no routes to receive them, and credentials saved on the Providers page are
**stored-only** (encrypted, server-side). Nothing in the prototype calls out.
