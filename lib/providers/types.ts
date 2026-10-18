// Provider adapter interfaces — all voice/telephone/LLM providers sit behind these.
// Swap implementations without touching the call engine or UI.
// Real telephony is DISABLED until a provider is configured with real credentials
// and explicitly enabled (ProviderConfig.isLive = true).
import type { AgentConfig } from "../agent-config";

export type CallDirection = "inbound" | "outbound";

export interface CallRequest {
  agentConfig: AgentConfig;
  direction: CallDirection;
  from: string; // caller number (E.164)
  to: string;   // business number (E.164)
  metadata?: Record<string, string>;
}

export interface TranscriptTurn {
  role: "agent" | "caller" | "system";
  text: string;
  at: string; // ISO timestamp
}

export interface CallOutcome {
  type: "booking" | "lead" | "faq" | "message" | "transfer" | "none";
  summary: string;
  details?: Record<string, unknown>;
}

export interface CallResult {
  status: "answered" | "missed" | "failed" | "transferred";
  transcript: TranscriptTurn[];
  summary: string;
  outcome: CallOutcome;
  durationSec: number;
  recordingUrl?: string;
  error?: string;
}

// ------------------------------------------------------------ speech (TTS/STT)
export interface TtsRequest {
  text: string;
  voiceId: string;
  language: string;
  style?: string;
}

export interface TtsProvider {
  readonly name: string;
  synthesize(req: TtsRequest): Promise<{ audioBase64: string; mimeType: string; simulated: boolean }>;
  listVoices(): Promise<{ id: string; name: string; language: string }[]>;
}

export interface SttProvider {
  readonly name: string;
  transcribe(audioBase64: string, language: string): Promise<{ text: string; confidence: number; simulated: boolean }>;
}

// ------------------------------------------------------- conversational AI
export interface OrchestrationRequest {
  agentConfig: AgentConfig;
  transcript: TranscriptTurn[];
  callerUtterance: string;
  tools: ToolDefinition[];
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON schema
}

export interface OrchestrationResponse {
  replyText: string;
  toolCalls: { name: string; arguments: Record<string, unknown> }[];
  endCall: boolean;
  transferRequested: boolean;
  simulated: boolean;
}

export interface OrchestrationProvider {
  readonly name: string;
  respond(req: OrchestrationRequest): Promise<OrchestrationResponse>;
}

// -------------------------------------------------------------- telephony
export interface TelephonyCapabilities {
  inbound: boolean;
  outbound: boolean;
  numberProvisioning: boolean;
  transfers: boolean;
  recordings: boolean;
  supportedCountries: string[];
}

export interface TelephonyProvider {
  readonly name: string;
  readonly capabilities: TelephonyCapabilities;
  /** Place an outbound call. MUST throw unless provider is live-configured. */
  placeCall(req: CallRequest): Promise<{ providerCallId: string }>;
  /** Handle an inbound webhook payload. Returns a CallRequest or null. */
  parseInboundWebhook(payload: unknown, signature: string | null): Promise<CallRequest | null>;
  /** Verify a webhook signature. */
  verifyWebhookSignature(payload: string, signature: string | null, secret: string): boolean;
  /** Provision a phone number. MUST throw unless live-configured. */
  provisionNumber(country: string, areaCode?: string): Promise<{ phoneNumber: string }>;
  /** Transfer an in-progress call. MUST throw unless live-configured. */
  transferCall(providerCallId: string, target: string): Promise<void>;
}

export interface VoiceProviderBundle {
  tts: TtsProvider;
  stt: SttProvider;
  orchestration: OrchestrationProvider;
  telephony: TelephonyProvider;
  /** True only when real credentials are configured AND the workspace enabled live mode. */
  isLive: boolean;
}
