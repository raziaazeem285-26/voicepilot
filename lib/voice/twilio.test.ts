// Unit tests: Twilio signature validation + TwiML builders.
import { describe, expect, it } from "vitest";
import { createHmac } from "crypto";
import { verifyTwilioSignature, twimlConnectStream, twimlSayHangup, twimlDialHuman } from "./twilio";

const AUTH_TOKEN = "test-auth-token-123";
const URL = "https://example.com/api/voice/incoming-call";
const PARAMS: Record<string, string> = { CallSid: "CA123", From: "+15551234567", To: "+15557654321" };

function validSig(): string {
  const data = URL + Object.keys(PARAMS).sort().map(k => k + PARAMS[k]).join("");
  return createHmac("sha1", AUTH_TOKEN).update(data, "utf8").digest("base64");
}

describe("verifyTwilioSignature", () => {
  it("accepts a correctly computed signature", () => {
    expect(verifyTwilioSignature(AUTH_TOKEN, validSig(), URL, PARAMS)).toBe(true);
  });
  it("rejects a tampered parameter", () => {
    const tampered = { ...PARAMS, From: "+19999999999" };
    expect(verifyTwilioSignature(AUTH_TOKEN, validSig(), URL, tampered)).toBe(false);
  });
  it("rejects a tampered URL", () => {
    expect(verifyTwilioSignature(AUTH_TOKEN, validSig(), URL + "?x=1", PARAMS)).toBe(false);
  });
  it("rejects a wrong auth token", () => {
    expect(verifyTwilioSignature("wrong-token", validSig(), URL, PARAMS)).toBe(false);
  });
  it("rejects missing signature or token", () => {
    expect(verifyTwilioSignature(AUTH_TOKEN, null, URL, PARAMS)).toBe(false);
    expect(verifyTwilioSignature("", validSig(), URL, PARAMS)).toBe(false);
  });
  it("rejects a replayed signature on different params", () => {
    const other = { ...PARAMS, CallSid: "CA999" };
    expect(verifyTwilioSignature(AUTH_TOKEN, validSig(), URL, other)).toBe(false);
  });
});

describe("TwiML builders", () => {
  it("builds a Connect/Stream document with parameters", () => {
    const xml = twimlConnectStream("wss://bridge.example/twilio", { workspaceId: "ws1", callSid: "CA1" });
    expect(xml).toContain("<Connect>");
    expect(xml).toContain('<Stream url="wss://bridge.example/twilio">');
    expect(xml).toContain('name="workspaceId" value="ws1"');
  });
  it("escapes XML in stream URLs and params", () => {
    const xml = twimlConnectStream("wss://x/?a=1&b=2", { k: "<evil>" });
    expect(xml).toContain("a=1&amp;b=2");
    expect(xml).toContain("&lt;evil&gt;");
    expect(xml).not.toContain("<evil>");
  });
  it("builds a say+hangup fallback", () => {
    const xml = twimlSayHangup("Sorry <bye>");
    expect(xml).toContain("<Hangup />");
    expect(xml).toContain("Sorry &lt;bye&gt;");
  });
  it("builds a Dial transfer", () => {
    const xml = twimlDialHuman("+15550001111");
    expect(xml).toContain("<Dial");
    expect(xml).toContain("+15550001111");
  });
});
