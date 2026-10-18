// Mock call-flow engine — powers the "Call playground" (simulated calls only).
// Every result is labeled simulated. Real telephony is never invoked here.
// Compliance enforced: AI disclosure, recording consent, do-not-call,
// calling-hour windows, and prohibited-action refusals.
import type { AgentConfig, QualificationQuestion } from "../agent-config";
import type { CallOutcome, TranscriptTurn } from "../providers/types";
import { TOOL_REGISTRY, generateSlots, type ToolContext } from "./tools";

export interface SimulatorInput {
  agentConfig: AgentConfig;
  workspace: { timezone: string };
  /** Merged FAQs: agent config FAQs + knowledge base entries. */
  knowledge: { question: string; answer: string }[];
  callerScript: string[];
  callerName?: string;
  callerPhone?: string;
  direction?: "inbound" | "outbound";
  doNotCall?: boolean;
  hasConsent?: boolean; // outbound only
  recordingAnswer?: "yes" | "no";
  now?: Date;
  existingBookings?: { start: Date; end: Date }[];
}

export interface SimulatedCallResult {
  status: "answered" | "missed" | "failed" | "transferred";
  transcript: TranscriptTurn[];
  summary: string;
  outcome: CallOutcome;
  durationSec: number;
  costEstimateUsd: number;
  isSimulated: true;
  aiDisclosed: boolean;
  recordingConsent: "granted" | "declined" | "not-applicable";
  toolAudit: { action: string; details: Record<string, unknown> }[];
  blocked?: { reason: string };
}

/** Mock per-minute rate for cost estimates (DIY stack, research §7.2). */
export const MOCK_RATE_PER_MIN = 0.029;

const STOPWORDS = new Set(
  "a,an,the,and,or,but,of,to,in,on,for,with,at,by,from,is,are,was,were,be,been,do,does,did,have,has,had,i,you,we,they,it,this,that,these,those,my,your,our,me,him,her,them,what,when,where,which,who,how,can,could,would,should,please,just,like,so,very,really".split(",")
);

function tokens(s: string): string[] {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(t => t && !STOPWORDS.has(t));
}

function includesAny(hay: string, needles: string[]): boolean {
  const h = hay.toLowerCase();
  return needles.some(n => h.includes(n));
}

// ------------------------------------------------------------ intent detection
type Intent = "prohibited" | "transfer" | "booking" | "faq" | "message" | "unknown";

const TRANSFER_SIGNALS = [
  "human", "real person", "real human", "person please", "manager", "supervisor",
  "someone else", "transfer me", "get me", "don't understand", "dont understand",
  "you're stupid", "you are stupid", "idiot", "useless", "stupid", "complaint",
  "lawyer", "attorney", "sue you",
];

const BOOKING_SIGNALS = [
  "book", "appointment", "schedule", "reserve", "reservation", "slot", "available",
  "availability", "come in", "visit",
  // service-request language (home services, salon, clinic, etc.)
  "need someone", "send someone", "come out", "come over", "fix", "repair",
  "broken", "not working", "isn't working", "leaking", "leak", "emergency", "urgent",
  "problem with", "issue with", "help me with", "take a look",
];

const MESSAGE_SIGNALS = ["take a message", "leave a message", "message for", "call me back", "callback"];

// Emergency situations: preempt EVERYTHING (including booking flows) and
// route to a human immediately. The agent never tries to "handle" these.
const EMERGENCY_SIGNALS = [
  "gas leak", "smell gas", "smells like gas", "carbon monoxide",
  "flooding", "flood", "burst pipe", "pipe burst",
  "electrical fire", "fire", "sparking", "sparks", "smoke coming",
  "water pouring", "ceiling collapsing",
];

function detectEmergency(text: string): boolean {
  return includesAny(text, EMERGENCY_SIGNALS);
}

// Sensitive topics the agent must refuse and route to qualified staff.
const SENSITIVE_TOPICS: { topic: string; signals: string[] }[] = [
  { topic: "medical diagnosis or treatment", signals: ["diagnos", "prescri", "symptom", "what's wrong", "what is wrong", "what do you think", "disease", "treatment", "should i take", "dosage", "side effect", "is it cancer", "broken bone", "hurting", "hurts", "pain", "ache", "toothache", "fever", "infection", "bleeding", "swollen", "swelling", "rash", "prescription"] },
  { topic: "legal advice", signals: ["legal advice", "sue someone", "lawsuit", "attorney advice", "is it legal"] },
  { topic: "financial advice", signals: ["invest in", "stock tip", "crypto", "should i buy"] },
];

function detectSensitive(text: string): string | null {
  for (const t of SENSITIVE_TOPICS) {
    if (includesAny(text, t.signals)) return t.topic;
  }
  return null;
}

function findFaq(text: string, faqs: { question: string; answer: string }[]): { question: string; answer: string; score: number } | null {
  const t = new Set(tokens(text));
  if (t.size === 0) return null;
  let best: { question: string; answer: string; score: number } | null = null;
  for (const f of faqs) {
    const q = new Set(tokens(f.question));
    if (q.size === 0) continue;
    const overlap = [...q].filter(w => t.has(w)).length;
    const score = overlap / q.size;
    if ((score >= 0.4 || overlap >= 3) && (!best || score > best.score)) {
      best = { ...f, score };
    }
  }
  return best;
}

function classify(text: string, faqs: { question: string; answer: string }[]): { intent: Intent; sensitiveTopic?: string; faq?: { question: string; answer: string } } {
  const sensitive = detectSensitive(text);
  if (sensitive) return { intent: "prohibited", sensitiveTopic: sensitive };
  if (includesAny(text, TRANSFER_SIGNALS)) return { intent: "transfer" };
  if (includesAny(text, BOOKING_SIGNALS)) return { intent: "booking" };
  if (includesAny(text, MESSAGE_SIGNALS)) return { intent: "message" };
  const faq = findFaq(text, faqs);
  if (faq) return { intent: "faq", faq };
  return { intent: "unknown" };
}

// --------------------------------------------------------------- calling window
/** US TCPA calling window: 8:00–21:00 called-party local time. */
export function isWithinCallingWindow(now: Date, timezone: string): boolean {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, hour: "numeric", hour12: false }).formatToParts(now);
  const hour = Number(parts.find(p => p.type === "hour")?.value ?? "12") % 24;
  return hour >= 8 && hour < 21;
}

// ------------------------------------------------------------------- engine
type BookingState =
  | { phase: "idle" }
  | { phase: "qualifying"; qi: number; answers: Record<string, string> }
  | { phase: "slots"; slots: { start: string; end: string; label: string }[]; answers: Record<string, string> }
  | { phase: "confirm"; slot: { start: string; end: string; label: string }; answers: Record<string, string> };

export async function runSimulatedCall(input: SimulatorInput): Promise<SimulatedCallResult> {
  const cfg = input.agentConfig;
  const now = input.now ?? new Date();
  const direction = input.direction ?? "inbound";
  const transcript: TranscriptTurn[] = [];
  const toolAudit: { action: string; details: Record<string, unknown> }[] = [];
  let t = 0;
  const stamp = () => new Date(now.getTime() + t++ * 9000).toISOString();
  const say = (role: "agent" | "caller" | "system", text: string) => transcript.push({ role, text, at: stamp() });

  const toolCtx: ToolContext = {
    agentConfig: cfg,
    workspaceId: "",
    orgId: "",
    now,
    existingBookings: input.existingBookings ?? [],
    confirmed: false,
  };
  const runTool = async (name: string, args: Record<string, unknown>, confirmed = false) => {
    const tool = TOOL_REGISTRY[name];
    if (!tool) throw new Error(`Unknown tool ${name}`);
    const res = await tool.run(args, { ...toolCtx, confirmed });
    toolAudit.push(...res.auditEvents);
    return res;
  };

  // Declared early: finish() (used by the outbound gating below) closes over these.
  const aiDisclosed = cfg.aiDisclosure;
  let recordingConsent: SimulatedCallResult["recordingConsent"] = "not-applicable";

  // ------------------------------------------- outbound compliance gating
  if (direction === "outbound") {
    if (input.doNotCall) {
      const reason = "Blocked: number is on the do-not-call list. Outbound call not placed.";
      say("system", reason);
      return finish("failed", reason, { type: "none", summary: reason });
    }
    if (!input.hasConsent) {
      const reason = "Blocked: no prior express consent on file for this number. Outbound AI calls require consent (TCPA/FCC 24-17).";
      say("system", reason);
      return finish("failed", reason, { type: "none", summary: reason });
    }
    if (!isWithinCallingWindow(now, input.workspace.timezone)) {
      const reason = "Blocked: outside permitted calling hours (8:00–21:00 called-party local time).";
      say("system", reason);
      return finish("failed", reason, { type: "none", summary: reason });
    }
  }

  // ------------------------------------------------------- greeting + disclosure
  let greeting = cfg.greeting;
  if (aiDisclosed && !/ai assistant/i.test(greeting)) {
    greeting += " Just so you know, I'm an AI assistant.";
  }
  say("agent", greeting);

  // ------------------------------------------------------- recording consent
  if (cfg.recordingConsent === "ask") {
    say("agent", "Before we continue — do I have your permission to record this call for quality purposes?");
    const answer = (input.recordingAnswer ?? "yes").toLowerCase();
    say("caller", answer === "yes" ? "Yes, that's fine." : "No, please don't record.");
    recordingConsent = answer === "yes" ? "granted" : "declined";
    toolAudit.push({ action: "consent.recording", details: { granted: answer === "yes", simulated: true } });
  } else if (cfg.recordingConsent === "always") {
    recordingConsent = "granted";
    say("system", "(This call is being recorded.)");
  }

  // ------------------------------------------------------- conversation loop
  const script = [...input.callerScript];
  let booking: BookingState = { phase: "idle" };
  let outcome: CallOutcome = { type: "none", summary: "No clear outcome." };
  let status: SimulatedCallResult["status"] = "answered";
  let unknownStreak = 0;
  let ended = false;
  const callerName = input.callerName ?? "the caller";

  const close = () => {
    say("agent", cfg.closing);
    ended = true;
  };

  const doTransfer = async (reason: string) => {
    const res = await runTool("transfer_to_human", { reason });
    const to = (res.data as { to?: string } | undefined)?.to ?? "a team member";
    say("agent", `Of course — let me transfer you to ${to} now. Please hold a moment.`);
    say("system", `(Call transferred — simulated. Reason: ${reason})`);
    status = "transferred";
    outcome = { type: "transfer", summary: `Transferred to human: ${reason}` };
    close();
  };

  const offerSlots = async (answers: Record<string, string> = {}): Promise<{ slots: { start: string; end: string; label: string }[] } | null> => {
    const res = await runTool("check_availability", { count: 3 });
    const slots = (res.data as { slots?: { start: string; end: string; label: string }[] } | undefined)?.slots ?? [];
    if (!res.ok || slots.length === 0) {
      say("agent", "I'm sorry, I couldn't find any open slots right now. I can take a message and we'll call you back — would that work?");
      return null;
    }
    say("agent", `Here are some open times: ${slots.map((s, i) => `${i + 1}) ${s.label}`).join("; ")}. Which works best for you?`);
    return { slots };
  };

  const pickSlot = (utterance: string, slots: { start: string; end: string; label: string }[]) => {
    const u = utterance.toLowerCase();
    const ordinals: Record<string, number> = { first: 0, second: 1, third: 2, "1": 0, "2": 1, "3": 2, one: 0, two: 1, three: 2 };
    for (const [k, idx] of Object.entries(ordinals)) {
      if (u.includes(k) && slots[idx]) return slots[idx];
    }
    return slots.find(s => u.includes(s.label.toLowerCase().split(" at ")[1] ?? "")) ?? null;
  };

  // Normalize FAQs once: agent config uses {q,a}, knowledge uses {question,answer}.
  const allFaqs: { question: string; answer: string }[] = [
    ...cfg.faqs.map(f => ({ question: f.q, answer: f.a })),
    ...input.knowledge,
  ];

  while (script.length > 0 && !ended) {
    const utterance = script.shift()!;
    say("caller", utterance);

    // --- emergency preempts everything (even mid-booking)
    if (detectEmergency(utterance)) {
      say("agent", "That sounds urgent — I'm connecting you to a human right away. If anyone is in danger, please hang up and call emergency services.");
      say("system", "(Emergency transfer — simulated.)");
      status = "transferred";
      outcome = { type: "transfer", summary: `Emergency transfer: ${utterance.slice(0, 120)}` };
      toolAudit.push({ action: "emergency.transfer", details: { utterance: utterance.slice(0, 120), simulated: true } });
      await runTool("transfer_to_human", { reason: `possible emergency: ${utterance.slice(0, 120)}` });
      close();
      continue;
    }

    // --- in booking flow: consume utterances for the state machine
    // (explicit casts: the `let` initializer would otherwise narrow the union)
    const phase = booking.phase as BookingState["phase"];
    if (phase === "qualifying") {
      const qb = booking as Extract<BookingState, { phase: "qualifying" }>;
      const qs = cfg.qualificationQuestions;
      const q: QualificationQuestion = qs[qb.qi];
      const answers: Record<string, string> = { ...qb.answers, [q.id]: utterance };
      const next: number = qb.qi + 1;
      if (next < qs.length) {
        booking = { phase: "qualifying", qi: next, answers };
        say("agent", qs[next].question);
      } else {
        const offered = await offerSlots(answers);
        booking = offered ? { phase: "slots", slots: offered.slots, answers } : { phase: "idle" };
      }
      continue;
    }
    if (phase === "slots") {
      const sb = booking as Extract<BookingState, { phase: "slots" }>;
      const slot = pickSlot(utterance, sb.slots);
      if (!slot) {
        say("agent", "I didn't catch which time — could you say the first, second, or third option?");
        continue;
      }
      booking = { phase: "confirm", slot, answers: sb.answers };
      say("agent", `Just to confirm: ${slot.label} for ${callerName}. Should I go ahead and book it?`);
      continue;
    }
    if (phase === "confirm") {
      const cb = booking as Extract<BookingState, { phase: "confirm" }>;
      if (/\b(yes|yeah|yep|confirm|book it|go ahead|sure)\b/i.test(utterance)) {
        const res = await runTool("book_appointment", {
          startIso: cb.slot.start,
          callerName,
          callerPhone: input.callerPhone ?? "",
          notes: JSON.stringify(cb.answers),
        }, true);
        if (res.ok) {
          say("agent", `You're booked for ${cb.slot.label}. We'll see you then!`);
          outcome = { type: "booking", summary: `Booked ${cb.slot.label} for ${callerName}`, details: res.data as Record<string, unknown> };
        } else {
          say("agent", res.error ?? "Something went wrong with the booking. Let me transfer you to the team.");
          if (!ended) await doTransfer("booking failed");
        }
        booking = { phase: "idle" };
        close();
      } else {
        say("agent", "No problem — we won't book anything. Is there anything else I can help with?");
        booking = { phase: "idle" };
      }
      continue;
    }

    // --- normal intent classification
    const c = classify(utterance, allFaqs);
    if (c.intent === "prohibited") {
      say("agent", `I understand, but I'm not able to help with ${c.sensitiveTopic} — that's something for our qualified team. I can transfer you to them right now, or take a message. Which would you prefer?`);
      outcome = { type: "none", summary: `Refused sensitive topic (${c.sensitiveTopic}); offered transfer.` };
      // next utterance decides: transfer-ish -> transfer, else continue
      const next = script.shift();
      if (next) {
        say("caller", next);
        if (includesAny(next, ["transfer", "yes", "please", "sure", "human"])) { await doTransfer(`sensitive topic: ${c.sensitiveTopic}`); }
        else { say("agent", "Understood. Is there anything else I can help with?"); }
      }
      continue;
    }
    if (c.intent === "transfer") {
      await doTransfer("caller requested a human");
      continue;
    }
    if (c.intent === "booking") {
      if (!cfg.appointmentRules.enabled) {
        say("agent", "I don't handle bookings directly, but I can take a message and have the team call you back. What's the message?");
        const msg = script.shift();
        if (msg) {
          say("caller", msg);
          const r = await runTool("take_message", { message: msg, callerName, callbackNumber: input.callerPhone ?? "" });
          if (r.ok) { outcome = { type: "message", summary: "Message taken (booking not enabled).", details: r.data as Record<string, unknown> }; }
          say("agent", "Got it — I've passed your message along. They'll get back to you shortly.");
        }
        close();
        continue;
      }
      if (cfg.qualificationQuestions.length > 0) {
        booking = { phase: "qualifying", qi: 0, answers: {} };
        say("agent", `Happy to help with that. ${cfg.qualificationQuestions[0].question}`);
      } else {
        const offered = await offerSlots();
        booking = offered ? { phase: "slots", slots: offered.slots, answers: {} } : { phase: "idle" };
      }
      continue;
    }
    if (c.intent === "message") {
      say("agent", "Of course — what's the message, and the best number to reach you?");
      const msg = script.shift();
      if (msg) {
        say("caller", msg);
        const r = await runTool("take_message", { message: msg, callerName, callbackNumber: input.callerPhone ?? "" });
        if (r.ok) outcome = { type: "message", summary: "Message taken.", details: r.data as Record<string, unknown> };
        say("agent", "Thank you — I've saved your message and we'll call you back.");
      }
      close();
      continue;
    }
    if (c.intent === "faq" && c.faq) {
      say("agent", c.faq.answer);
      outcome = { type: "faq", summary: `Answered FAQ: "${c.faq.question}"` };
      unknownStreak = 0;
      continue;
    }
    // unknown
    unknownStreak += 1;
    if (unknownStreak >= 2) {
      await doTransfer("repeated confusion");
    } else {
      say("agent", "I want to make sure I get this right — could you rephrase that? Or I can transfer you to the team.");
    }
  }

  if (!ended) close();

  function finish(
    s: SimulatedCallResult["status"],
    summary: string,
    oc: CallOutcome
  ): SimulatedCallResult {
    const durationSec = Math.min(transcript.length * 9 + 6, 3600);
    const minutes = durationSec / 60;
    return {
      status: s,
      transcript,
      summary,
      outcome: oc,
      durationSec,
      costEstimateUsd: Math.round(minutes * MOCK_RATE_PER_MIN * 10000) / 10000,
      isSimulated: true,
      aiDisclosed,
      recordingConsent,
      toolAudit,
    };
  }

  // cap by max call minutes
  const maxSec = cfg.timeouts.maxCallMinutes * 60;
  const durationSec = Math.min(transcript.length * 9 + 6, maxSec);
  const minutes = durationSec / 60;
  return {
    status,
    transcript,
    summary: outcome.summary !== "No clear outcome." ? outcome.summary : `Simulated ${direction} call with ${transcript.length} turns.`,
    outcome,
    durationSec,
    costEstimateUsd: Math.round(minutes * MOCK_RATE_PER_MIN * 10000) / 10000,
    isSimulated: true,
    aiDisclosed,
    recordingConsent,
    toolAudit,
  };
}
