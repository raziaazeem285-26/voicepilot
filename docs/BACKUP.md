# Backup & Restore

## What to back up

1. **The Postgres database** — everything lives there: users, sessions, orgs,
   workspaces, agents, templates, contacts, call logs + transcripts, usage,
   encrypted provider credentials, audit logs.
2. **Environment secrets** (outside the DB): `DATABASE_URL`,
   `APP_ENCRYPTION_KEY`, provider API keys. Without the exact
   `APP_ENCRYPTION_KEY`, encrypted credentials in the DB are unrecoverable —
   back the key up **separately and securely** (password manager / secrets
   vault), never next to the DB dump.

Nothing else needs backup: the repo is the source of truth for code; uploaded
files don't exist in this prototype.

## Strategy: pg_dump

```bash
# Daily, compressed custom-format dump (cron example, 02:00)
0 2 * * * pg_dump -Fc "postgresql://voicepilot:<pw>@localhost:5432/voicepilot" \
  -f /backups/voicepilot-$(date +\%F).dump >> /backups/pg_dump.log 2>&1
```

Suggested retention: **daily dumps × 7 days, weekly × 4 weeks, monthly × 6 months**.
Encrypt dumps at rest (they contain bcrypt password hashes, session token hashes,
and encrypted credential blobs). Managed Postgres (RDS/Neon/Supabase): use the
provider's automated backups + point-in-time recovery instead of hand-rolled cron.

Verify restores, not just dumps: restore to a scratch DB quarterly.

## Restore

```bash
# New empty database
sudo -u postgres psql -c "CREATE DATABASE voicepilot_restored OWNER voicepilot;"
pg_restore -d "postgresql://voicepilot:<pw>@localhost:5432/voicepilot_restored" \
  -c /backups/voicepilot-2026-10-18.dump

# Then point the app at it:
DATABASE_URL="postgresql://voicepilot:<pw>@localhost:5432/voicepilot_restored"
APP_ENCRYPTION_KEY="<same key as when the dump was taken>"
npx prisma migrate deploy   # no-op if dump included migrations table
```

Caveats:

- Restoring an **old dump with a rotated encryption key** breaks
  `decryptSecret` for saved credentials — re-save them on the Providers page.
- All sessions in `Session` survive the restore; users stay logged in unless you
  truncate the table.
- The `_prisma_migrations` table is inside the dump; a restore never needs a
  fresh `migrate dev`, only `migrate deploy` as a sanity check.
