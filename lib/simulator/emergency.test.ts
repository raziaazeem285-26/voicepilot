// Tests: emergency fallback preempts everything, including booking flows.
import { describe, expect, it } from "vitest";
import { runSimulatedCall } from "./engine";
import { defaultAgentConfig } from "../agent-config";

describe("emergency fallback", () => {
  it("transfers immediately on a gas leak report", async () => {
    const result = await runSimulatedCall({
      agentConfig: defaultAgentConfig(),
      workspace: { timezone: "America/Chicago" },
      knowledge: [],
      callerScript: ["There's a gas leak in my basement!"],
    });
    expect(result.status).toBe("transferred");
    expect(result.outcome.type).toBe("transfer");
    expect(result.outcome.summary).toMatch(/emergency/i);
    const agentTexts = result.transcript.filter(t => t.role === "agent").map(t => t.text).join(" ");
    expect(agentTexts).toMatch(/emergency services/i);
  });
  it("preempts an in-progress booking flow", async () => {
    const cfg = defaultAgentConfig();
    cfg.appointmentRules.enabled = true;
    const result = await runSimulatedCall({
      agentConfig: cfg,
      workspace: { timezone: "America/Chicago" },
      knowledge: [],
      callerScript: ["I need to book an appointment", "The basement is flooding!"],
    });
    expect(result.status).toBe("transferred");
    expect(result.outcome.summary).toMatch(/emergency/i);
    // No booking should have been created.
    expect(result.outcome.type).not.toBe("booking");
  });
  it("does not trigger on non-emergency water mention", async () => {
    const result = await runSimulatedCall({
      agentConfig: defaultAgentConfig(),
      workspace: { timezone: "America/Chicago" },
      knowledge: [],
      callerScript: ["Do you service water heaters?"],
    });
    expect(result.outcome.summary).not.toMatch(/emergency/i);
  });
});
