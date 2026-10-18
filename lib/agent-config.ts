// AgentConfig — the full configuration schema for an AI voice agent.
// Stored as JSON on Agent.config. All fields have safe defaults (see defaultAgentConfig).
export interface BusinessHours {
  timezone: string;
  // 0=Sunday..6=Saturday -> [openHHMM, closeHHMM] | null (closed)
  days: Record<string, [string, string] | null>;
  holidays: string[]; // YYYY-MM-DD
}

export interface QualificationQuestion {
  id: string;
  question: string;
  required: boolean;
}

export interface AgentConfig {
  identity: { businessName: string; agentName: string };
  purpose: string;
  systemInstructions: string;
  greeting: string;
  closing: string;
  languages: string[];
  voice: { provider: string; voiceId: string; style: string };
  businessHours: BusinessHours;
  faqs: { q: string; a: string }[];
  qualificationQuestions: QualificationQuestion[];
  appointmentRules: {
    enabled: boolean;
    slotMinutes: number;
    leadTimeHours: number;
    maxDaysAhead: number;
    confirmBeforeBooking: boolean;
  };
  transferConditions: string[];
  escalationContacts: { name: string; phone: string; when: string }[];
  timeouts: { maxCallMinutes: number; noResponseSeconds: number };
  allowedActions: string[];
  prohibitedActions: string[];
  aiDisclosure: boolean;
  recordingConsent: "always" | "ask" | "never";
}

export function defaultBusinessHours(timezone = "America/New_York"): BusinessHours {
  return {
    timezone,
    days: {
      "0": null,
      "1": ["09:00", "17:00"],
      "2": ["09:00", "17:00"],
      "3": ["09:00", "17:00"],
      "4": ["09:00", "17:00"],
      "5": ["09:00", "17:00"],
      "6": ["10:00", "14:00"],
    },
    holidays: [],
  };
}

export function defaultAgentConfig(businessName = "Acme Services"): AgentConfig {
  return {
    identity: { businessName, agentName: "Alex" },
    purpose: "Answer common questions and help callers reach the right outcome.",
    systemInstructions:
      "You are a helpful AI phone assistant. Be concise, polite, and professional. " +
      "Only answer from approved business information. If you do not know something, say so and offer to transfer to a human. " +
      "Never claim abilities you do not have. Never provide medical, legal, or financial advice — route those to qualified staff.",
    greeting: `Hi, thanks for calling ${businessName}. This is Alex, the AI assistant. How can I help you today?`,
    closing: "Thanks for calling. Have a great day!",
    languages: ["en"],
    voice: { provider: "mock", voiceId: "mock-voice-1", style: "professional" },
    businessHours: defaultBusinessHours(),
    faqs: [],
    qualificationQuestions: [],
    appointmentRules: {
      enabled: false,
      slotMinutes: 30,
      leadTimeHours: 2,
      maxDaysAhead: 14,
      confirmBeforeBooking: true,
    },
    transferConditions: ["caller asks for a human", "caller is upset", "question outside approved topics"],
    escalationContacts: [],
    timeouts: { maxCallMinutes: 10, noResponseSeconds: 8 },
    allowedActions: ["answer_faq", "check_availability", "book_appointment", "take_message", "transfer_to_human"],
    prohibitedActions: ["give medical diagnosis", "give legal advice", "promise pricing not in approved info", "impersonate a human"],
    aiDisclosure: true,
    recordingConsent: "ask",
  };
}

/** Merge a partial config over defaults (shallow per top-level key). */
export function mergeAgentConfig(partial: Partial<AgentConfig>): AgentConfig {
  const base = defaultAgentConfig(partial.identity?.businessName ?? "Acme Services");
  return { ...base, ...partial, identity: { ...base.identity, ...(partial.identity ?? {}) }, voice: { ...base.voice, ...(partial.voice ?? {}) }, appointmentRules: { ...base.appointmentRules, ...(partial.appointmentRules ?? {}) }, timeouts: { ...base.timeouts, ...(partial.timeouts ?? {}) } };
}

/** Validate an AgentConfig; returns a list of human-readable errors (empty = valid). */
export function validateAgentConfig(cfg: AgentConfig): string[] {
  const errors: string[] = [];
  if (!cfg.identity?.businessName?.trim()) errors.push("Business name is required.");
  if (!cfg.identity?.agentName?.trim()) errors.push("Agent name is required.");
  if (!cfg.greeting?.trim()) errors.push("Greeting message is required.");
  if (!cfg.closing?.trim()) errors.push("Closing message is required.");
  if (!Array.isArray(cfg.languages) || cfg.languages.length === 0) errors.push("At least one language is required.");
  if (cfg.timeouts?.maxCallMinutes < 1 || cfg.timeouts?.maxCallMinutes > 60)
    errors.push("Max call minutes must be between 1 and 60.");
  if (cfg.appointmentRules?.enabled && cfg.appointmentRules.slotMinutes < 5)
    errors.push("Appointment slot must be at least 5 minutes.");
  return errors;
}
