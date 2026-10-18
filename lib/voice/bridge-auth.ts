// Server-to-server auth between the voice bridge and the Next.js control plane.
// Every bridge→control-plane request carries:
//   x-bridge-timestamp : unix ms (must be within CLOCK_SKEW_MS of now)
//   x-bridge-nonce     : random unique per request (replay protection)
//   x-bridge-signature : HMAC-SHA256(BRIDGE_SHARED_SECRET, timestamp + "\n" + nonce + "\n" + method + "\n" + path + "\n" + body)
//   x-bridge-scope     : permission scope, e.g. "voice:tool", "voice:call-closed"
// The control plane ALWAYS re-validates workspaceId/agentId server-side —
// a client-supplied workspaceId is never proof of access (advisor fix).
import { createHmac, randomBytes, timingSafeEqual } from "crypto";

const CLOCK_SKEW_MS = 5 * 60 * 1000; // 5 minutes
const NONCE_TTL_MS = 10 * 60 * 1000;

// In-memory nonce store (single-process). For multi-instance, move to Redis/DB.
const seenNonces = new Map<string, number>();

export function pruneNonces(now = Date.now()): number {
  let removed = 0;
  for (const [n, exp] of seenNonces) {
    if (exp <= now) {
      seenNonces.delete(n);
      removed++;
    }
  }
  return removed;
}

function getSecret(): string {
  const s = process.env.BRIDGE_SHARED_SECRET;
  if (!s) throw new Error("BRIDGE_SHARED_SECRET is not set");
  return s;
}

export interface SignedHeaders {
  "x-bridge-timestamp": string;
  "x-bridge-nonce": string;
  "x-bridge-signature": string;
  "x-bridge-scope": string;
}

/** Sign an outgoing bridge request. Returns headers to attach. */
export function signBridgeRequest(
  method: string,
  path: string,
  body: string,
  scope: string,
  secret = process.env.BRIDGE_SHARED_SECRET
): SignedHeaders {
  if (!secret) throw new Error("BRIDGE_SHARED_SECRET is not set");
  const timestamp = String(Date.now());
  const nonce = randomBytes(16).toString("hex");
  const payload = [timestamp, nonce, method.toUpperCase(), path, body].join("\n");
  const signature = createHmac("sha256", secret).update(payload, "utf8").digest("hex");
  return {
    "x-bridge-timestamp": timestamp,
    "x-bridge-nonce": nonce,
    "x-bridge-signature": signature,
    "x-bridge-scope": scope,
  };
}

export type BridgeAuthResult =
  | { ok: true; scope: string }
  | { ok: false; reason: string };

/**
 * Verify an incoming bridge request. Checks signature, timestamp skew,
 * nonce replay, and that the scope is in the allowed set for the endpoint.
 */
export function verifyBridgeRequest(
  headers: Headers | Record<string, string | null>,
  method: string,
  path: string,
  body: string,
  allowedScopes: string[],
  now = Date.now()
): BridgeAuthResult {
  const get = (k: string): string | null => {
    if (typeof (headers as Headers).get === "function") return (headers as Headers).get(k);
    const v = (headers as Record<string, string | null>)[k];
    return v ?? null;
  };
  const timestamp = get("x-bridge-timestamp");
  const nonce = get("x-bridge-nonce");
  const signature = get("x-bridge-signature");
  const scope = get("x-bridge-scope");
  if (!timestamp || !nonce || !signature || !scope) {
    return { ok: false, reason: "missing bridge auth headers" };
  }
  if (!allowedScopes.includes(scope)) {
    return { ok: false, reason: `scope '${scope}' not allowed here` };
  }
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(now - ts) > CLOCK_SKEW_MS) {
    return { ok: false, reason: "timestamp outside allowed skew" };
  }
  pruneNonces(now);
  if (seenNonces.has(nonce)) {
    return { ok: false, reason: "replayed nonce" };
  }
  let secret: string;
  try {
    secret = getSecret();
  } catch {
    return { ok: false, reason: "bridge auth not configured" };
  }
  const payload = [timestamp, nonce, method.toUpperCase(), path, body].join("\n");
  const expected = createHmac("sha256", secret).update(payload, "utf8").digest("hex");
  const a = Buffer.from(signature, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: "bad signature" };
  }
  seenNonces.set(nonce, now + NONCE_TTL_MS);
  return { ok: true, scope };
}
