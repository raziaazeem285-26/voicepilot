// Provider stubs — documented, NOT live.
// Each stub implements the provider interfaces but throws until real credentials
// are configured AND the workspace explicitly enables live mode.
// Setup metadata below is drawn from the Oct 2026 market research report.
// Cost figures: research §7.2 (verified where marked). Terms notes: research §§5, 9.
//
// Recommended path (research verdict):
//   MVP      -> Deepgram Voice Agent API ($0.075/min) + Twilio telephony.
//              Deepgram's ToS explicitly permits multi-tenant SaaS integration.
//   Scale    -> DIY: Twilio/Plivo + Deepgram Nova-3 STT + TTS router (~$0.026/min).
// Terms warnings:
//   - Vapi ToS (Sept 14, 2026) PROHIBITS reselling the service as your own SaaS.
//   - ElevenLabs enterprise T&Cs PROHIBIT resale/bundling without written agreement.
//   - OpenAI tts-1 / tts-1-hd / gpt-4o-mini-tts shut off Jan 6, 2027 — do not build on them.
import type {
  CallRequest, TelephonyCapabilities, TelephonyProvider, VoiceProviderBundle,
} from "./types";
import { createMockBundle } from "./mock";

export class ProviderNotConfigured extends Error {
  constructor(provider: string, hint: string) {
    super(`${provider} is not configured for live use. ${hint}`);
    this.name = "ProviderNotConfigured";
  }
}

export interface ProviderSetupGuide {
  provider: "twilio" | "vapi" | "retell" | "deepgram";
  displayName: string;
  credentialFields: { key: string; label: string; hint: string }[];
  docsUrl: string;
  costNotes: string;
  termsNotes: string;
  recommendedFor: string;
}

export const PROVIDER_SETUP_GUIDES: ProviderSetupGuide[] = [
  {
    provider: "twilio",
    displayName: "Twilio (telephony)",
    credentialFields: [
      { key: "accountSid", label: "Account SID", hint: "From twilio.com/console" },
      { key: "authToken", label: "Auth Token", hint: "Keep secret — stored encrypted, server-side only" },
      { key: "phoneNumber", label: "Twilio phone number", hint: "E.164, e.g. +15551234567" },
    ],
    docsUrl: "https://www.twilio.com/docs/voice",
    costNotes: "Verified Oct 2026: US inbound $0.0085/min, outbound $0.0140/min, local number $1.15/mo.",
    termsNotes: "Standard carrier terms. Trial accounts prepend a test disclaimer — use a paid account for pilots.",
    recommendedFor: "Telephony layer for both the Deepgram MVP and the DIY stack.",
  },
  {
    provider: "deepgram",
    displayName: "Deepgram (voice agent API)",
    credentialFields: [
      { key: "apiKey", label: "API Key", hint: "From console.deepgram.com" },
    ],
    docsUrl: "https://developers.deepgram.com/docs/voice-agent",
    costNotes: "Verified Oct 2026: Voice Agent API $0.075/min (STT+LLM+TTS bundled). Nova-3 STT alone $0.0077/min PAYG.",
    termsNotes: "Deepgram's ToS explicitly permits multi-tenant SaaS integration — the only rented voice option with this clearance (research §2.4.4).",
    recommendedFor: "MVP voice brain: one API for STT + LLM + TTS over Twilio Media Streams.",
  },
  {
    provider: "vapi",
    displayName: "Vapi (orchestration)",
    credentialFields: [
      { key: "apiKey", label: "API Key", hint: "From dashboard.vapi.ai" },
      { key: "phoneNumberId", label: "Phone Number ID", hint: "Optional: Vapi-provisioned or imported number" },
    ],
    docsUrl: "https://docs.vapi.ai",
    costNotes: "Verified Oct 2026: $0.05/min hosting + provider pass-through (~$0.08–0.13/min all-in).",
    termsNotes: "WARNING: Vapi ToS (Sept 14, 2026) §2(a)/§2(d)(1) prohibits licensing, selling, or commercially exploiting the service as your own SaaS. Agency services for clients may be permissible — get a legal read before charging clients on Vapi usage.",
    recommendedFor: "Developer-led builds only; NOT for white-label resale without legal clearance.",
  },
  {
    provider: "retell",
    displayName: "Retell AI (orchestration)",
    credentialFields: [
      { key: "apiKey", label: "API Key", hint: "From dashboard.retellai.com" },
    ],
    docsUrl: "https://docs.retellai.com",
    costNotes: "Verified Oct 2026: PAYG $0.07–$0.31/min by component; US telephony $0.015/min; numbers $2.00/mo.",
    termsNotes: "Resale/white-label clause unverified from public pages — confirm with Retell before reselling.",
    recommendedFor: "Component-priced voice agents; verify resale terms first.",
  },
];

function stubTelephony(name: string, guide: ProviderSetupGuide): TelephonyProvider {
  const err = () => new ProviderNotConfigured(guide.displayName,
    `Add credentials on the Providers page. See ${guide.docsUrl}`);
  return {
    name,
    capabilities: {
      inbound: true, outbound: true, numberProvisioning: true,
      transfers: true, recordings: true, supportedCountries: ["US", "CA", "GB", "AU"],
    } as TelephonyCapabilities,
    placeCall: async (_req: CallRequest) => { throw err(); },
    parseInboundWebhook: async () => { throw err(); },
    verifyWebhookSignature: () => false,
    provisionNumber: async (_country: string, _areaCode?: string) => { throw err(); },
    transferCall: async (_id: string, _target: string) => { throw err(); },
  };
}

/**
 * Resolve the provider bundle for a workspace.
 * Today: ALWAYS returns the mock bundle (simulated). Live providers require:
 *   1. credentials saved (encrypted) via the Providers API,
 *   2. ProviderConfig.enabled = true AND isLive = true,
 *   3. a real adapter implementation (Phase 2 — voice bridge).
 * Until then this throws ProviderNotConfigured for non-mock providers.
 */
export async function getProviderBundle(provider: string): Promise<VoiceProviderBundle> {
  if (provider === "mock") return createMockBundle();
  const guide = PROVIDER_SETUP_GUIDES.find(g => g.provider === provider);
  const hint = guide
    ? `Setup guide: ${guide.displayName} — ${guide.docsUrl}`
    : "Unknown provider.";
  throw new ProviderNotConfigured(provider, hint);
}

export function stubTelephonyForGuide(guide: ProviderSetupGuide): TelephonyProvider {
  return stubTelephony(`${guide.provider}-stub`, guide);
}
