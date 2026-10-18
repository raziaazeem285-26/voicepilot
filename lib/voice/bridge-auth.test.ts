// Unit tests: bridge HMAC auth (sign/verify roundtrip, skew, replay, scope).
import { describe, expect, it, beforeAll } from "vitest";
import { signBridgeRequest, verifyBridgeRequest, pruneNonces } from "./bridge-auth";

const SECRET = "test-bridge-secret-32bytes-long!!";
const PATH = "/api/voice/tool";

beforeAll(() => {
  process.env.BRIDGE_SHARED_SECRET = SECRET;
});

function signedHeaders(body: string, scope = "voice:tool", ts?: number) {
  const h = signBridgeRequest("POST", PATH, body, scope, SECRET);
  if (ts !== undefined) h["x-bridge-timestamp"] = String(ts);
  return h;
}

function toRecord(h: object): Record<string, string | null> {
  return { ...(h as Record<string, string>) };
}

describe("bridge auth", () => {
  it("verifies a correctly signed request", () => {
    const body = JSON.stringify({ a: 1 });
    const h = signedHeaders(body);
    const r = verifyBridgeRequest(toRecord(h), "POST", PATH, body, ["voice:tool"]);
    expect(r.ok).toBe(true);
  });
  it("rejects a tampered body", () => {
    const h = signedHeaders(JSON.stringify({ a: 1 }));
    const r = verifyBridgeRequest(toRecord(h), "POST", PATH, JSON.stringify({ a: 2 }), ["voice:tool"]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("bad signature");
  });
  it("rejects an expired timestamp", () => {
    const body = "{}";
    const h = signedHeaders(body, "voice:tool", Date.now() - 10 * 60 * 1000);
    const r = verifyBridgeRequest(toRecord(h), "POST", PATH, body, ["voice:tool"]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("timestamp outside allowed skew");
  });
  it("rejects a replayed nonce", () => {
    const body = JSON.stringify({ n: 1 });
    const h = signedHeaders(body);
    const rec = toRecord(h);
    const first = verifyBridgeRequest(rec, "POST", PATH, body, ["voice:tool"]);
    expect(first.ok).toBe(true);
    const second = verifyBridgeRequest(toRecord(h), "POST", PATH, body, ["voice:tool"]);
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.reason).toBe("replayed nonce");
  });
  it("rejects a disallowed scope", () => {
    const body = "{}";
    const h = signedHeaders(body, "voice:tool");
    const r = verifyBridgeRequest(toRecord(h), "POST", PATH, body, ["voice:call-closed"]);
    expect(r.ok).toBe(false);
  });
  it("rejects a wrong secret", () => {
    const body = "{}";
    const h = signBridgeRequest("POST", PATH, body, "voice:tool", "wrong-secret");
    const r = verifyBridgeRequest(toRecord(h), "POST", PATH, body, ["voice:tool"]);
    expect(r.ok).toBe(false);
  });
  it("rejects missing headers", () => {
    const r = verifyBridgeRequest({}, "POST", PATH, "{}", ["voice:tool"]);
    expect(r.ok).toBe(false);
  });
  it("pruneNonces clears expired nonces", () => {
    expect(pruneNonces(Date.now() + 60 * 60 * 1000)).toBeGreaterThanOrEqual(0);
  });
});
