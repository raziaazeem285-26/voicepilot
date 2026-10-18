# Voice Bridge — Deployment Guide

The voice bridge (`~/workspace/voicepilot-bridge/`) is a **separate long-lived
Node service**. It terminates Twilio Media Streams WebSockets and bridges audio
to the voice provider (mock by default, Deepgram Voice Agent API when
configured).

**It does NOT run on Vercel.** Serverless functions cannot hold the persistent
per-call WebSockets Twilio requires. Deploy it on Fly.io, Railway, or any VPS.

## What was verified (2026-10-18)

- Twilio Media Streams protocol: base64 μ-law JSON events (`connected` /
  `start` / `media` / `stop`), `clear` for barge-in, paced 20ms outbound frames.
  Source: https://www.twilio.com/docs/voice/twiml/stream
- Deepgram Voice Agent API: `wss://agent.deepgram.com/agent`,
  `Authorization: Token <key>`, `Welcome` → `Settings` → `SettingsApplied`,
  then binary audio. Telephony uses raw μ-law 8kHz.
  Source: https://developers.deepgram.com/docs/voice-agent-message-flow
  and https://developers.deepgram.com/docs/inbound-telephony-agent
- **Re-verify before the first real call:** exact telephony audio keys in the
  `Settings` message and the function-call event shape (Deepgram iterates fast).
  These are flagged `VERIFY` in `src/bridges.js`.

## Run locally (mock — no credentials, no phone)

```bash
cd ~/workspace/voicepilot-bridge
npm install
cp .env.example .env   # set BRIDGE_SHARED_SECRET = same value as the Next.js app
npm start              # ws://localhost:8080/twilio
# another terminal:
node dev-client.js <workspaceId> <agentId>   # scripted test call
```

The dev-client speaks the Twilio control protocol plus scripted `{event:"say"}`
utterances, so the entire path (webhook → bridge → signed tool calls →
call-closed → dashboard) is testable with zero provider accounts.

## Deploy to Fly.io

```bash
cd ~/workspace/voicepilot-bridge
flyctl launch --no-deploy   # Node app, internal port 8080
flyctl secrets set BRIDGE_SHARED_SECRET=... CONTROL_PLANE_URL=https://<your-app>.vercel.app
# optional, only for the real voice path:
flyctl secrets set DEEPGRAM_API_KEY=...
```

`fly.toml` essentials:

```toml
[http_service]
  internal_port = 8080
  force_https = true

# Keep one machine warm in production — a cold start adds 1-3s to the first ring.
# (Suspend-on-idle is fine for testing.)
min_machines_running = 1
```

Then set `BRIDGE_PUBLIC_URL=wss://<your-bridge>.fly.dev/twilio` in the Next.js
app's env. Twilio's number webhook points at
`https://<your-app>.vercel.app/api/voice/incoming-call`, which returns TwiML
`<Connect><Stream url="wss://<your-bridge>.fly.dev/twilio">`.

## Going live (checklist)

1. Paid Twilio account (trial accounts play a disclaimer) + one US local number.
2. Deepgram API key ($200 free credit, no card).
3. `PhoneNumber` row for the Twilio number → workspace/agent (dashboard or DB).
4. `BRIDGE_SHARED_SECRET` identical on both services; rotate periodically.
5. Re-verify Deepgram WS schemas against the live API reference.
6. Place a test call; confirm transcript, outcome, and cost in the dashboard.
7. Set per-workspace minute quotas + budget alerts before any customer traffic.

## Mock vs live

| Mode | Trigger | Behavior |
|---|---|---|
| Mock (default) | no `DEEPGRAM_API_KEY` | `MockBridge` handles calls; all outputs labeled simulated |
| Live | `DEEPGRAM_API_KEY` set | `DeepgramBridge`; real STT/LLM/TTS; costs accrue per RateCard |

Live mode still refuses to place outbound calls unless the workspace has
explicit outbound consent records. Inbound is always answered (DNC never
blocks inbound).
