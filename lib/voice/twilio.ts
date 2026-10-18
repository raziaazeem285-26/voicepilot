// Twilio webhook validation + TwiML builders.
// Verified against https://www.twilio.com/docs/usage/security (X-Twilio-Signature
// = HMAC-SHA1 of full URL + sorted POST params, keyed with the Auth Token).
import { createHmac, timingSafeEqual } from "crypto";

/** Validate the X-Twilio-Signature header for an incoming webhook. */
export function verifyTwilioSignature(
  authToken: string,
  signature: string | null,
  fullUrl: string,
  params: Record<string, string>
): boolean {
  if (!authToken || !signature) return false;
  const data = fullUrl + Object.keys(params).sort().map(k => k + params[k]).join("");
  const expected = createHmac("sha1", authToken).update(data, "utf8").digest("base64");
  const a = Buffer.from(signature, "utf8");
  const b = Buffer.from(expected, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Escape XML text content. */
function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** TwiML that bridges the call into a Media Stream WebSocket (the voice bridge). */
export function twimlConnectStream(streamUrl: string, params: Record<string, string> = {}): string {
  const p = Object.entries(params)
    .map(([k, v]) => `        <Parameter name="${esc(k)}" value="${esc(v)}" />`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Connect>
        <Stream url="${esc(streamUrl)}">
${p}
        </Stream>
    </Connect>
</Response>`;
}

/** TwiML that speaks a message and hangs up (fallback / rejection path). */
export function twimlSayHangup(message: string, voice = "alice"): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="${esc(voice)}">${esc(message)}</Say>
    <Hangup />
</Response>`;
}

/** TwiML that warm-transfers the caller to a human number. */
export function twimlDialHuman(targetE164: string, callerId?: string): string {
  const callerAttr = callerId ? ` callerId="${esc(callerId)}"` : "";
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say>Please hold while I connect you.</Say>
    <Dial${callerAttr} timeout="20">${esc(targetE164)}</Dial>
</Response>`;
}

export const TWIML_CONTENT_TYPE = "text/xml; charset=utf-8";
