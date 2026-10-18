// Unit tests: tool framework (availability, booking validation, permissions).
import { describe, expect, it } from "vitest";
import { generateSlots, checkAvailabilityTool, bookAppointmentTool, transferToHumanTool, takeMessageTool, type ToolContext } from "./tools";
import { defaultAgentConfig, defaultBusinessHours } from "../agent-config";

function ctx(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    agentConfig: defaultAgentConfig("Test Co"),
    workspaceId: "ws1",
    orgId: "org1",
    now: new Date("2026-10-19T14:00:00Z"), // Monday 10am EDT
    existingBookings: [],
    confirmed: false,
    ...overrides,
  };
}

describe("generateSlots", () => {
  it("generates slots inside business hours only", () => {
    const slots = generateSlots(defaultBusinessHours("America/New_York"), {
      now: new Date("2026-10-19T14:00:00Z"),
      slotMinutes: 30, leadTimeHours: 1, maxDaysAhead: 2, existing: [], count: 50,
    });
    expect(slots.length).toBeGreaterThan(0);
    // No Sunday slots (closed) — check weekday of each slot in business tz
    for (const s of slots) {
      const wd = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short" }).format(s.start);
      expect(wd).not.toBe("Sun");
    }
  });

  it("skips existing bookings", () => {
    const base = { now: new Date("2026-10-19T14:00:00Z"), slotMinutes: 60, leadTimeHours: 0, maxDaysAhead: 1, existing: [] as { start: Date; end: Date }[], count: 50 };
    const free = generateSlots(defaultBusinessHours("America/New_York"), base);
    const blocked = generateSlots(defaultBusinessHours("America/New_York"), {
      ...base, existing: [{ start: free[0].start, end: free[0].end }],
    });
    expect(blocked.length).toBe(free.length - 1);
    expect(blocked.some(s => s.start.getTime() === free[0].start.getTime())).toBe(false);
  });

  it("respects lead time", () => {
    const slots = generateSlots(defaultBusinessHours("America/New_York"), {
      now: new Date("2026-10-19T14:00:00Z"),
      slotMinutes: 30, leadTimeHours: 48, maxDaysAhead: 5, existing: [], count: 50,
    });
    const earliest = new Date("2026-10-19T14:00:00Z").getTime() + 48 * 3600_000;
    for (const s of slots) expect(s.start.getTime()).toBeGreaterThanOrEqual(earliest);
  });
});

describe("checkAvailabilityTool", () => {
  it("denies when booking is disabled", async () => {
    const c = ctx();
    c.agentConfig.appointmentRules.enabled = false;
    const r = await checkAvailabilityTool.run({}, c);
    expect(r.ok).toBe(false);
  });

  it("denies when action not in allowedActions", async () => {
    const c = ctx();
    c.agentConfig.appointmentRules.enabled = true;
    c.agentConfig.allowedActions = [];
    const r = await checkAvailabilityTool.run({}, c);
    expect(r.ok).toBe(false);
    expect(r.auditEvents[0].action).toBe("tool.denied");
  });

  it("returns real slots when enabled", async () => {
    const c = ctx();
    c.agentConfig.appointmentRules.enabled = true;
    const r = await checkAvailabilityTool.run({ count: 3 }, c);
    expect(r.ok).toBe(true);
    expect((r.data as { slots: unknown[] }).slots.length).toBe(3);
  });
});

describe("bookAppointmentTool", () => {
  it("requires confirmation for the sensitive booking action", async () => {
    const c = ctx();
    c.agentConfig.appointmentRules.enabled = true;
    const avail = await checkAvailabilityTool.run({ count: 1 }, c);
    const slot = (avail.data as { slots: { start: string }[] }).slots[0];
    const r = await bookAppointmentTool.run({ startIso: slot.start, callerName: "Jane" }, { ...c, confirmed: false });
    expect(r.ok).toBe(false);
    expect(r.needsConfirmation).toBeDefined();
  });

  it("refuses to book a slot that is not actually available", async () => {
    const c = ctx();
    c.agentConfig.appointmentRules.enabled = true;
    const r = await bookAppointmentTool.run(
      { startIso: "2026-10-18T02:00:00.000Z", callerName: "Jane" }, // Sunday 10pm EDT — closed
      { ...c, confirmed: true }
    );
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/no longer available/i);
  });

  it("books a verified slot after confirmation", async () => {
    const c = ctx();
    c.agentConfig.appointmentRules.enabled = true;
    const avail = await checkAvailabilityTool.run({ count: 1 }, c);
    const slot = (avail.data as { slots: { start: string }[] }).slots[0];
    const r = await bookAppointmentTool.run({ startIso: slot.start, callerName: "Jane" }, { ...c, confirmed: true });
    expect(r.ok).toBe(true);
    expect((r.data as { status: string }).status).toContain("booked");
  });

  it("requires a caller name", async () => {
    const c = ctx();
    c.agentConfig.appointmentRules.enabled = true;
    const avail = await checkAvailabilityTool.run({ count: 1 }, c);
    const slot = (avail.data as { slots: { start: string }[] }).slots[0];
    const r = await bookAppointmentTool.run({ startIso: slot.start, callerName: "" }, { ...c, confirmed: true });
    expect(r.ok).toBe(false);
  });
});

describe("transferToHumanTool / takeMessageTool", () => {
  it("transfers with audit event", async () => {
    const r = await transferToHumanTool.run({ reason: "test" }, ctx());
    expect(r.ok).toBe(true);
    expect(r.auditEvents[0].action).toBe("tool.transfer_to_human");
  });

  it("take_message requires message text", async () => {
    const r = await takeMessageTool.run({ message: "" }, ctx());
    expect(r.ok).toBe(false);
  });
});
