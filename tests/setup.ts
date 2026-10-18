// Vitest setup: point Prisma at the isolated test database.
// Runs before any test file, so lib/db.ts picks up the test DATABASE_URL.
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://voicepilot:voicepilot@localhost:5432/voicepilot_test";
process.env.APP_ENCRYPTION_KEY =
  process.env.APP_ENCRYPTION_KEY ?? "dGVzdGtleXRlc3RrZXl0ZXN0a2V5dGVzdGtleXRlc3Q="; // 32 bytes base64 (test only)
