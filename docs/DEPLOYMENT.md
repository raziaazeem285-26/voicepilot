# Production Deployment

This prototype is deployable as a standard Next.js + Postgres app, but **do
not present it as live telephony** — nothing here places real calls.

## Pre-deploy checklist

- [ ] **Env vars set** (see below) — all secret ones out of the repo.
- [ ] **Postgres managed service** provisioned (RDS / Neon / Supabase / Cloud SQL).
      Backups + point-in-time recovery enabled (see BACKUP.md).
- [ ] `npx prisma migrate deploy` against the production DB (migrations:
      `20261018030824_init`, `20261018032000_money_decimal`). Never run
      `migrate dev` against production.
- [ ] `npx prisma generate && npm run build` succeeds.
- [ ] `node prisma/seed.ts` run once (idempotent — plans, admin, templates).
- [ ] `npm run start` behind a process manager (systemd / pm2 / Docker restart
      policy) on a fixed port, reverse-proxied with TLS.
- [ ] `NODE_ENV=production` → session cookies get the `Secure` flag automatically.
- [ ] Admin password rotated (see below).

## Environment variables

| Var | Required | Notes |
|---|---|---|
| `DATABASE_URL` | yes | Managed Postgres connection string; pool params per provider |
| `APP_ENCRYPTION_KEY` | yes | **Generate fresh for prod**: `openssl rand -base64 32`. 32 bytes base64. |
| `NEXT_PUBLIC_BRAND_NAME` | no | Overrides product name in UI |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `DEEPGRAM_API_KEY`, `VAPI_API_KEY`, `RETELL_API_KEY` | no | Leave empty — mock/simulated mode is the default and only real mode today |

## Build & process

```bash
npm ci
npx prisma generate
npx prisma migrate deploy      # run BEFORE starting the app, on each deploy
node prisma/seed.ts            # safe to re-run (upserts)
npm run build
npm run start -- -p 3001       # or NODE_PORT via your process manager
```

Put `migrate deploy` in your deploy pipeline (not in the start command of every
instance — with multiple instances it races; one deploy-time migration step is
cleaner).

## APP_ENCRYPTION_KEY rotation

- Rotating the key **invalidates all existing encrypted values** (`ProviderConfig.credentialsEnc`,
  `Integration.configEnc`). Decryption with the wrong key throws — calls are not
  interrupted (mock doesn't read them), but saved provider credentials become
  unreadable and must be re-entered.
- Rotation procedure: set new key → redeploy → have each workspace re-save
  provider credentials on the Providers page.

## What NOT to do

1. **Do not enable live telephony.** Even with `ProviderConfig.isLive = true`,
   `placeCall` / `provisionNumber` / `transferCall` throw for every provider.
   Live calling requires the **Phase-2 voice bridge** (separate long-lived
   service: Twilio Media Streams + Deepgram Voice Agent API) — see ROADMAP.md.
   There is currently no API path that places a real call, by design.
2. Do not set provider env keys expecting live behavior — the stubs throw
   `ProviderNotConfigured` until Phase 2 lands.
3. Do not run multiple app instances behind a load balancer **without** replacing
   the in-memory rate limiter (see LIMITATIONS.md — use Redis in Phase 3).
4. Do not store the production `APP_ENCRYPTION_KEY` in the repo, logs, or chat —
   treat it like a database password.
