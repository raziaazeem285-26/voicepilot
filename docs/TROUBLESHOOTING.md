# Troubleshooting

## Ports

**`Error: listen EADDRINUSE` / port 3000 taken.**
Port 3000 is occupied in this environment by default. Always run the dev server
with an explicit port:

```bash
npm run dev -p 3001
```

## Database

**`permission denied for schema public` on migrate.**
The `voicepilot` role lacks schema privileges:

```sql
GRANT CREATE ON SCHEMA public TO voicepilot;
```

**`P1001` / can't reach database server.** Check Postgres is running
(`systemctl status postgresql`), that `localhost:5432` accepts TCP, and that
`DATABASE_URL` matches the role/password/database you created.

## Prisma

**Prisma version mismatch (advisor-reviewed item — already fixed).**
Both `prisma` and `@prisma/client` are **pinned to 6.19.3**. If you see
"mismatching versions" warnings after editing `package.json`, delete
`node_modules`, run `npm install` fresh, and `npx prisma generate`.

**Engine binary download fails (ECONNRESET).**
Transient network issue — retry `npm install`. Behind a proxy, set
`PRISMA_BINARIES_MIRROR`. We hit this once during setup; pinning the version
kept it reproducible.

## Encryption

**`APP_ENCRYPTION_KEY is not set` / `must be 32 bytes (base64)`.**
Set it and regenerate the exact format:

```bash
export APP_ENCRYPTION_KEY="$(openssl rand -base64 32)"
```

**Decryption failures ("Malformed encrypted payload" / GCM auth errors).**
Almost always a **wrong key** — the key in the environment is not the key that
encrypted the row. Causes: key rotated, `.env` overwritten, or pointing at a
DB copy taken under a different key. Fix: restore the original key, or re-save
the credentials/integration configs (the Providers page re-encrypts).

## Auth

**401 on every API call after login.** The session cookie is `voicepilot_session`
(`HttpOnly`, `SameSite=Lax`; `Secure` only when `NODE_ENV=production`). Check
you're hitting the same origin/port as the login, and that the `Session` row
hasn't expired (30-day TTL). Sign out and in again; old tokens are destroyed on
signout.

## Rate limiting (429)

429s with `{"error": "Too many requests..."}` come from the in-memory sliding
window in `lib/rate-limit.ts` (key = `<route-key>:<ip>`, `Retry-After` header
included). Limits per route:

| Route key | Limit / window |
|---|---|
| `auth:signin`, `auth:signup`, `orgs:create` | 10 / min |
| `ws:create`, `providers:setup` | 20 / min |
| `agents:create`, `agents:from-template`, `kb:add` | 30 / min |
| `simulate` | 60 / min |

If you're legitimately hitting these during testing, wait for the window or
restart the dev server (buckets are in-memory and reset on restart).

## Seed

**Re-running `node prisma/seed.ts` is safe** — plans and templates are upserted
by key, the admin user is created only if `admin@voicepilot.local` doesn't
exist. It never deletes or duplicates.

**Seed fails with DB connection error.** Same as P1001 above — check
`DATABASE_URL` and that migrations have run first (`npx prisma migrate deploy`).

## Build

**Type errors after a schema change.** Run `npx prisma generate`, then
`npm run build`. The generated client is cached in `node_modules` — stale
output causes phantom errors.
