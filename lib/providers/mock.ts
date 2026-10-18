// MockProvider — fully working SIMULATED implementations of every provider interface.
// Used by default. placeCall / provisionNumber / transferCall ALWAYS throw:
// live telephony is impossible through the mock by design.
import { createHmac, timingSafeEqual } from "crypto";
import type {
  CallRequest, OrchestrationProvider, OrchestrationRequest, OrchestrationResponse,
  SttProvider, TelephonyProvider, TtsProvider, TtsRequest, VoiceProviderBundle,
} from "./types";

const MOCK_VOICES = [
  { id: "mock-voice-1", name: "Alex (mock)", language: "en" },
  { id: "mock-voice-2", name: "Riley (mock)", language: "en" },
  { id: "mock-voice-3", name: "Nora (mock)", language: "en" },
];

class MockTts implements TtsProvider {
  readonly name = "mock-tts";
  async synthesize(req: TtsRequest) {
    void req;
    return { audioBase64: "", mimeType: "audio/wav", simulated: true };
  }
  async listVoices() {
    return MOCK_VOICES;
  }
}

class MockStt implements SttProvider {
  readonly name = "mock-stt";
  async transcribe(_audioBase64: string, _language: string) {
    // No real audio in the simulator; the playground passes text directly.
    return { text: "", confidence: 1, simulated: true };
  }
}

class MockOrchestration implements OrchestrationProvider {
  readonly name = "mock-orchestration";
  async respond(req: OrchestrationRequest): Promise<OrchestrationResponse> {
    // The full rule-based brain lives in lib/simulator/engine.ts.
    // This adapter exposes the same contract for API consumers.
    const last = req.callerUtterance.toLowerCase();
    const transfer = /human|real person|manager|supervisor|transfer/.test(last);
    return {
      replyText: transfer
        ? "Of course — let me transfer you to the team. (simulated)"
        : `Thanks — I heard: "${req.callerUtterance}". (simulated reply; use the Call playground for the full flow.)`,
      toolCalls: [],
      endCall: false,
      transferRequested: transfer,
      simulated: true,
    };
  }
}

class MockTelephony implements TelephonyProvider {
  readonly name = "mock-telephony";
  readonly capabilities = {
    inbound: false,
    outbound: false,
    numberProvisioning: false,
    transfers: false,
    recordings: false,
    supportedCountries: [] as string[],
  };
  async placeCall(_req: CallRequest): Promise<{ providerCallId: string }> {
    throw new Error(
      "Mock provider: live outbound calls are DISABLED. Configure a real telephony provider (Twilio/Deepgram) with credentials and enable live mode to place calls."
    );
  }
  async parseInboundWebhook() {
    return null;
  }
  verifyWebhookSignature(payload: string, signature: string | null, secret: string): boolean {
    if (!signature || !secret) return false;
    const expected = createHmac("sha256", secret).update(payload).digest("hex");
    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
  }
  async provisionNumber(_country: string, _areaCode?: string): Promise<{ phoneNumber: string }> {
    throw new Error("Mock provider: number provisioning is DISABLED. Configure a real telephony provider first.");
  }
  async transferCall(_providerCallId: string, _target: string): Promise<void> {
    throw new Error("Mock provider: live call transfer is DISABLED. Configure a real telephony provider first.");
  }
}

export function createMockBundle(): VoiceProviderBundle {
  return {
    tts: new MockTts(),
    stt: new MockStt(),
    orchestration: new MockOrchestration(),
    telephony: new MockTelephony(),
    isLive: false,
  };
}
