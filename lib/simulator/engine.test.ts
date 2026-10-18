// Unit tests: mock call-flow engine.
import { describe, expect, it } from "vitest";
import { runSimulatedCall, isWithinCallingWindow, MOCK_RATE_PER_MIN } from "./engine";
import { defaultAgentConfig, type AgentConfig } from "../agent-config";

function testConfig(overrides: Partial<AgentConfig> = {}): AgentConfig {
  const c = defaultAgentConfig("Test Plumbing Co");
  c.appointmentRules = { enabled: true, slotMinutes: 30, leadTimeHours: 1, maxDaysAhead: 7, confirmBeforeBooking: true };
  c.qualificationQuestions = [{ id: "issue", question: "What's the issue?", required: true }];
  c.faqs = [{ q: "What are your hours?", a: "Mon-Fri 9 to 5." }];
  return { ...c, ...overrides };
}

const BASE = {
  workspace: { timezone: "America/New_York" },
  knowledge: [] as { question: string; answer: string }[],
  now: new Date("2026-10-19T14:00:00Z"), // Monday
};

describe("runSimulatedCall", () => {
  it("completes a booking happy path with real slot verification", async () => {
    const r = await runSimulatedCall({
      ...BASE,
      agentConfig: testConfig(),
      callerScript: ["I need to book an appointment", "Leaky faucet", "The first one please", "Yes, book it"],
      callerName: "Jane Doe",
    });
    expect(r.status).toBe("answered");
    expect(r.outcome.type).toBe("booking");
    expect(r.isSimulated).toBe(true);
    expect(r.aiDisclosed).toBe(true);
    // booking tool audit present
    expect(r.toolAudit.some(a => a.action === "tool.book_appointment")).toBe(true);
    // transcript has greeting + closing
    expect(r.transcript[0].role).toBe("agent");
    expect(r.transcript[r.transcript.length - 1].text).toContain("great day");
  });

  it("transfers when the caller asks for a human", async () => {
    const r = await runSimulatedCall({
      ...BASE,
      agentConfig: testConfig(),
      callerScript: ["I want to talk to a human"],
    });
    expect(r.status).toBe("transferred");
    expect(r.outcome.type).toBe("transfer");
  });

  it("refuses medical diagnosis and routes to staff", async () => {
    const cfg = testConfig();
    cfg.systemInstructions += " Never diagnose.";
    const r = await runSimulatedCall({
      ...BASE,
      agentConfig: cfg,
      callerScript: ["My tooth hurts, what do you think is wrong?", "no, just answer me"],
    });
    const agentTexts = r.transcript.filter(t => t.role === "agent").map(t => t.text).join(" ");
    expect(agentTexts).toMatch(/not able to help with medical diagnosis/i);
    expect(r.outcome.summary).toMatch(/Refused sensitive topic/i);
  });

  it("answers FAQs from approved content", async () => {
    const r = await runSimulatedCall({
      ...BASE,
      agentConfig: testConfig(),
      callerScript: ["What are your hours?"],
    });
    expect(r.outcome.type).toBe("faq");
    const agentTexts = r.transcript.filter(t => t.role === "agent").map(t => t.text).join(" ");
    expect(agentTexts).toContain("Mon-Fri 9 to 5");
  });

  it("asks for recording consent when configured", async () => {
    const cfg = testConfig();
    cfg.recordingConsent = "ask";
    const r = await runSimulatedCall({ ...BASE, agentConfig: cfg, callerScript: ["hello"], recordingAnswer: "no" });
    expect(r.recordingConsent).toBe("declined");
  });

  it("blocks outbound calls to do-not-call numbers (inbound unaffected)", async () => {
    const blocked = await runSimulatedCall({
      ...BASE, agentConfig: testConfig(), direction: "outbound",
      doNotCall: true, hasConsent: true, callerScript: ["hello"],
    });
    expect(blocked.status).toBe("failed");
    expect(blocked.outcome.summary).toMatch(/do-not-call/i);

    // inbound from the same number is NOT blocked by DNC (DNC is outbound-only)
    const inbound = await runSimulatedCall({
      ...BASE, agentConfig: testConfig(), direction: "inbound",
      doNotCall: true, callerScript: ["What are your hours?"],
    });
    expect(inbound.status).toBe("answered");
  });

  it("blocks outbound calls without consent", async () => {
    const r = await runSimulatedCall({
      ...BASE, agentConfig: testConfig(), direction: "outbound",
      doNotCall: false, hasConsent: false, callerScript: ["hello"],
    });
    expect(r.status).toBe("failed");
    expect(r.outcome.summary).toMatch(/consent/i);
  });

  it("blocks outbound calls outside calling hours", async () => {
    const r = await runSimulatedCall({
      ...BASE,
      now: new Date("2026-10-19T03:00:00Z"), // 11pm EDT — outside 8am-9pm
      agentConfig: testConfig(), direction: "outbound",
      doNotCall: false, hasConsent: true, callerScript: ["hello"],
    });
    expect(r.status).toBe("failed");
    expect(r.outcome.summary).toMatch(/calling hours/i);
  });

  it("estimates cost at the mock per-minute rate", async () => {
    const r = await runSimulatedCall({ ...BASE, agentConfig: testConfig(), callerScript: ["What are your hours?"] });
    const expected = (r.durationSec / 60) * MOCK_RATE_PER_MIN;
    expect(r.costEstimateUsd).toBeCloseTo(expected, 4);
  });
});

describe("isWithinCallingWindow", () => {
  it("allows 2pm, blocks 11pm (America/New_York)", () => {
    expect(isWithinCallingWindow(new Date("2026-10-19T18:00:00Z"), "America/New_York")).toBe(true); // 2pm EDT
    expect(isWithinCallingWindow(new Date("2026-10-19T03:00:00Z"), "America/New_York")).toBe(false); // 11pm EDT
  });
});
