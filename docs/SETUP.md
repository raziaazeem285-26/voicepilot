# Local Setup

Prereqs: **Node 24**, **PostgreSQL 14+**, Git.

## 1. PostgreSQL: install, role, database

```bash
# Debian/Ubuntu
sudo apt install -y postgresql
sudo systemctl start postgresql

# Create role + database (uses md5 password auth on localhost)
sudo -u postgres psql <<'SQL'
CREATE ROLE voicepilot WITH LOGIN PASSWORD 'voicepilot_dev';
ALTER ROLE voicepilot CREATEDB;
CREATE DATABASE voicepilot OWNER voicepilot;
GRANT CREATE ON SCHEMA public TO voicepilot;
SQL
```

The `CREATEDB` + `GRANT CREATE ON SCHEMA public` are not optional: `prisma migrate
deploy` creates the `_prisma_migrations` table and shadow schemas, and without
them you hit **`permission denied for schema public`**. Re-run the `GRANT` if a
DB was restored or moved.

Quick check:

```bash
psql "postgresql://voicepilot:voicepilot_dev@localhost:5432/voicepilot" -c "select 1"
```

## 2. Clone & install

```bash
cd ~/workspace/voicepilot
npm install
```

## 3. Environment

```bash
cp .env.example .env
```

Fill in:

| Var | Value |
|---|---|
| `DATABASE_URL` | `postgresql://voicepilot:voicepilot_dev@localhost:5432/voicepilot` |
| `APP_ENCRYPTION_KEY` | **32 random bytes, base64**: `openssl rand -base64 32` |

The key must decode to exactly 32 bytes; `lib/crypto.ts` throws otherwise.
Generate a **different key per environment** — data encrypted with one key
cannot be decrypted with another (see TROUBLESHOOTING.md "decryption failures").

## 4. Migrate & seed

```bash
npx prisma migrate deploy   # applies prisma/migrations/* (init, money_decimal)
node prisma/seed.ts          # billing plans, admin@voicepilot.local/admin123, 10 templates
```

`node prisma/seed.ts` runs on Node 24 type-stripping; it is **idempotent**
(upserts) — safe to re-run. Admin login: `admin@voicepilot.local` / `admin123`.

## 5. Run

```bash
npm run dev -p 3001
```

Open http://localhost:3001. Port 3000 is typically occupied in this environment —
always pass `-p 3001`.

## 6. Test database & tests

Tests use an isolated database. Set up once:

```bash
sudo -u postgres psql -c "CREATE DATABASE voicepilot_test OWNER voicepilot;"
```

Then:

```bash
npm test   # vitest run — 38 tests (tenant isolation, engine, tools, core)
```

The test harness (`tests/setup.ts`) overrides `DATABASE_URL` to
`voicepilot_test` (or `TEST_DATABASE_URL`) and injects a test-only
`APP_ENCRYPTION_KEY`. It does **not** migrate — migrations must already exist in
the DB under test if a test needs schema. Today the DB-touching suite
(`tests/tenant-isolation.test.ts`) applies `prisma migrate deploy` against the
test DB via its own setup; make sure `voicepilot_test` exists first.

## Troubleshooting (errors we actually hit)

| Error | Cause | Fix |
|---|---|---|
| Prisma engine download fails: `ECONNRESET` / binary download error | Transient CDN/network failure | Pin Prisma to the known-good version (already pinned at **6.19.3** in `package.json`); retry `npm install`; if behind a proxy, set `PRISMA_BINARIES_MIRROR` or let the platform's proxy through |
| `permission denied for schema public` on migrate | Role lacks CREATE on the schema | `GRANT CREATE ON SCHEMA public TO voicepilot;` |
| `migrate dev` hangs / prompts in non-interactive shell | No TTY for confirmation prompts | Do not use `migrate dev` here — write migration SQL by hand (or via `prisma migrate diff`) and apply with `npx prisma migrate deploy` |
| `create-next-app` EPERM | Sandbox config dir not writable | `XDG_CONFIG_HOME=~/.config npm create next-app@latest` |
| Prisma client type errors after schema change | Stale generated client | `npx prisma generate` |

After any schema edit: `npx prisma migrate dev --name <change>` locally (TTY only),
`npx prisma generate`, then `npm test`.
