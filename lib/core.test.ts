// Unit tests: crypto, rate limiting, agent-config validation.
import { describe, expect, it } from "vitest";
import { encryptSecret, decryptSecret, encryptJson, decryptJson } from "./crypto";
import { rateLimit } from "./rate-limit";
import { validateAgentConfig, defaultAgentConfig } from "./agent-config";

describe("crypto (AES-256-GCM)", () => {
  it("round-trips secrets", () => {
    const enc = encryptSecret("sk-test-123");
    expect(enc).not.toContain("sk-test-123");
    expect(decryptSecret(enc)).toBe("sk-test-123");
  });

  it("round-trips JSON", () => {
    const enc = encryptJson({ apiKey: "abc", nested: { x: 1 } });
    expect(decryptJson<{ apiKey: string }>(enc).apiKey).toBe("abc");
  });

  it("rejects tampered payloads", () => {
    const enc = encryptSecret("hello");
    const tampered = enc.slice(0, -4) + "AAAA";
    expect(() => decryptSecret(tampered)).toThrow();
  });

  it("rejects malformed payloads", () => {
    expect(() => decryptSecret("not-a-payload")).toThrow();
  });
});

describe("rateLimit", () => {
  it("allows up to the limit then blocks", () => {
    const key = `test-${Date.now()}`;
    for (let i = 0; i < 5; i++) expect(rateLimit(key, 5, 60_000).allowed).toBe(true);
    const blocked = rateLimit(key, 5, 60_000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
  });

  it("isolates keys", () => {
    const a = `a-${Date.now()}`, b = `b-${Date.now()}`;
    rateLimit(a, 1, 60_000);
    expect(rateLimit(a, 1, 60_000).allowed).toBe(false);
    expect(rateLimit(b, 1, 60_000).allowed).toBe(true);
  });
});

describe("validateAgentConfig", () => {
  it("accepts the default config", () => {
    expect(validateAgentConfig(defaultAgentConfig("Acme"))).toEqual([]);
  });

  it("rejects missing business name / greeting", () => {
    const c = defaultAgentConfig("Acme");
    c.identity.businessName = "  ";
    c.greeting = "";
    const errs = validateAgentConfig(c);
    expect(errs.length).toBeGreaterThanOrEqual(2);
  });

  it("rejects out-of-range call minutes", () => {
    const c = defaultAgentConfig("Acme");
    c.timeouts.maxCallMinutes = 999;
    expect(validateAgentConfig(c).length).toBeGreaterThan(0);
  });
});
