// Secure tool framework for the call engine.
// Every tool: JSON-schema-described, permission-checked against the agent's
// allowedActions, input-validated, and returns audit events. Sensitive actions
// (booking) require explicit caller confirmation.
import type { AgentConfig, BusinessHours } from "../agent-config";

export interface ToolContext {
  agentConfig: AgentConfig;
  workspaceId: string;
  orgId: string;
  userId?: string;
  now: Date;
  /** Existing bookings in the mock calendar (for availability). */
  existingBookings: { start: Date; end: Date; title?: string }[];
  /** Caller has explicitly confirmed the pending sensitive action. */
  confirmed: boolean;
}

export interface ToolResult {
  ok: boolean;
  data?: Record<string, unknown>;
  error?: string;
  /** Human-readable events for the audit log. */
  auditEvents: { action: string; details: Record<string, unknown> }[];
  /** Set when the tool needs caller confirmation before proceeding. */
  needsConfirmation?: { summary: string };
}

export interface ToolDefinition {
  name: string;
  description: string;
  sensitive: boolean;
  parameters: Record<string, unknown>;
  run: (args: Record<string, unknown>, ctx: ToolContext) => Promise<ToolResult>;
}

function requirePermission(ctx: ToolContext, action: string): ToolResult | null {
  if (!ctx.agentConfig.allowedActions.includes(action)) {
    return {
      ok: false,
      error: `Action "${action}" is not permitted for this agent.`,
      auditEvents: [{ action: "tool.denied", details: { tool: action, reason: "not in allowedActions" } }],
    };
  }
  return null;
}

// ---------------------------------------------------------------- availability
function pad(n: number) {
  return String(n).padStart(2, "0");
}

/** Generate open slots from business hours, skipping existing bookings. */
export function generateSlots(
  hours: BusinessHours,
  opts: { now: Date; slotMinutes: number; leadTimeHours: number; maxDaysAhead: number; existing: { start: Date; end: Date }[]; count?: number }
): { start: Date; end: Date; label: string }[] {
  const slots: { start: Date; end: Date; label: string }[] = [];
  const earliest = new Date(opts.now.getTime() + opts.leadTimeHours * 3600_000);
  const tz = hours.timezone;

  // Work in the business timezone via Intl parts.
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const dayFmt = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", month: "short", day: "numeric" });
  const timeFmt = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit", hour12: true });

  for (let d = 0; d <= opts.maxDaysAhead && slots.length < (opts.count ?? 12); d++) {
    const probe = new Date(earliest.getTime() + d * 86400_000);
    const ymd = fmt.format(probe); // YYYY-MM-DD in business tz
    if (hours.holidays.includes(ymd)) continue;
    // weekday in business tz
    const weekday = Number(
      new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short" }).formatToParts(probe).find(p => p.type === "weekday")?.value === "Sun" ? 0 :
      ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].indexOf(
        new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short" }).format(probe)
      )
    );
    const window = hours.days[String(weekday)];
    if (!window) continue;
    const [open, close] = window;
    // Build slot start times on the HH:MM grid in business-tz wall time.
    // We compute by anchoring to the probe's business-tz date.
    const [oy, om, od] = ymd.split("-").map(Number);
    const [oh, omin] = open.split(":").map(Number);
    const [ch, cmin] = close.split(":").map(Number);
    // Convert wall time -> UTC using a fixed-offset approximation via Intl.
    // Simpler robust approach: iterate minutes in UTC and filter by business-tz wall clock.
    const dayStartUtc = Date.UTC(oy, om - 1, od, 0, 0, 0);
    for (let m = 0; m < 24 * 60 && slots.length < (opts.count ?? 12); m += opts.slotMinutes) {
      const start = new Date(dayStartUtc + m * 60_000);
      const end = new Date(start.getTime() + opts.slotMinutes * 60_000);
      if (start < earliest) continue;
      // wall-clock check in business tz
      const wallHm = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false }).format(start);
      const wallEnd = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false }).format(end);
      if (wallHm < open || wallEnd > close) continue;
      const overlaps = opts.existing.some(b => start < b.end && end > b.start);
      if (overlaps) continue;
      slots.push({ start, end, label: `${dayFmt.format(start)} at ${timeFmt.format(start)}` });
    }
  }
  return slots;
}

export const checkAvailabilityTool: ToolDefinition = {
  name: "check_availability",
  description: "Check real open appointment slots from business hours and the mock calendar.",
  sensitive: false,
  parameters: {
    type: "object",
    properties: { count: { type: "number", description: "How many slots to return (max 12)" } },
  },
  async run(args, ctx) {
    const denied = requirePermission(ctx, "check_availability");
    if (denied) return denied;
    const rules = ctx.agentConfig.appointmentRules;
    if (!rules.enabled) {
      return { ok: false, error: "Appointment booking is not enabled for this agent.", auditEvents: [{ action: "tool.denied", details: { tool: "check_availability", reason: "disabled" } }] };
    }
    const count = Math.min(12, Math.max(1, Number(args.count ?? 3) || 3));
    const slots = generateSlots(ctx.agentConfig.businessHours, {
      now: ctx.now,
      slotMinutes: rules.slotMinutes,
      leadTimeHours: rules.leadTimeHours,
      maxDaysAhead: rules.maxDaysAhead,
      existing: ctx.existingBookings,
      count,
    });
    return {
      ok: true,
      data: { slots: slots.map(s => ({ start: s.start.toISOString(), end: s.end.toISOString(), label: s.label })) },
      auditEvents: [{ action: "tool.check_availability", details: { count: slots.length } }],
    };
  },
};

// --------------------------------------------------------------------- booking
export const bookAppointmentTool: ToolDefinition = {
  name: "book_appointment",
  description: "Book an appointment into the mock calendar. Requires caller confirmation first.",
  sensitive: true,
  parameters: {
    type: "object",
    required: ["startIso", "callerName"],
    properties: {
      startIso: { type: "string", description: "ISO start time of a slot returned by check_availability" },
      callerName: { type: "string" },
      callerPhone: { type: "string" },
      notes: { type: "string" },
    },
  },
  async run(args, ctx) {
    const denied = requirePermission(ctx, "book_appointment");
    if (denied) return denied;
    const rules = ctx.agentConfig.appointmentRules;
    if (!rules.enabled) {
      return { ok: false, error: "Appointment booking is not enabled for this agent.", auditEvents: [{ action: "tool.denied", details: { tool: "book_appointment", reason: "disabled" } }] };
    }
    const startIso = String(args.startIso ?? "");
    const callerName = String(args.callerName ?? "").trim();
    if (!startIso || Number.isNaN(Date.parse(startIso)))
      return { ok: false, error: "A valid slot start time is required.", auditEvents: [] };
    if (!callerName)
      return { ok: false, error: "Caller name is required to book.", auditEvents: [] };
    const start = new Date(startIso);
    const end = new Date(start.getTime() + rules.slotMinutes * 60_000);
    // Re-validate against real availability (never confirm an unverified slot).
    const slots = generateSlots(ctx.agentConfig.businessHours, {
      now: ctx.now,
      slotMinutes: rules.slotMinutes,
      leadTimeHours: rules.leadTimeHours,
      maxDaysAhead: rules.maxDaysAhead,
      existing: ctx.existingBookings,
      count: 200,
    });
    const stillOpen = slots.some(s => s.start.getTime() === start.getTime());
    if (!stillOpen) {
      return {
        ok: false,
        error: "That slot is no longer available. Please pick another time.",
        auditEvents: [{ action: "tool.book_appointment.failed", details: { startIso, reason: "slot taken or outside hours" } }],
      };
    }
    if (rules.confirmBeforeBooking && !ctx.confirmed) {
      return {
        ok: false,
        needsConfirmation: {
          summary: `Book ${rules.slotMinutes} minutes starting ${start.toISOString()} for ${callerName}?`,
        },
        auditEvents: [{ action: "tool.book_appointment.confirm_requested", details: { startIso, callerName } }],
      };
    }
    return {
      ok: true,
      data: { start: start.toISOString(), end: end.toISOString(), callerName, status: "booked (simulated)" },
      auditEvents: [{ action: "tool.book_appointment", details: { startIso, callerName, simulated: true } }],
    };
  },
};

// -------------------------------------------------------------------- transfer
export const transferToHumanTool: ToolDefinition = {
  name: "transfer_to_human",
  description: "Transfer the call to a human escalation contact.",
  sensitive: false,
  parameters: {
    type: "object",
    properties: { reason: { type: "string" }, contactName: { type: "string" } },
  },
  async run(args, ctx) {
    const denied = requirePermission(ctx, "transfer_to_human");
    if (denied) return denied;
    const reason = String(args.reason ?? "caller requested");
    const contacts = ctx.agentConfig.escalationContacts;
    const target = contacts[0];
    return {
      ok: true,
      data: {
        transferred: true,
        to: target ? `${target.name} (${target.phone})` : "default human queue",
        reason,
        simulated: true,
      },
      auditEvents: [{ action: "tool.transfer_to_human", details: { reason, to: target?.phone ?? "queue", simulated: true } }],
    };
  },
};

// ------------------------------------------------------------------ message
export const takeMessageTool: ToolDefinition = {
  name: "take_message",
  description: "Record a message from the caller for the business.",
  sensitive: false,
  parameters: {
    type: "object",
    required: ["message"],
    properties: { message: { type: "string" }, callerName: { type: "string" }, callbackNumber: { type: "string" } },
  },
  async run(args, ctx) {
    const denied = requirePermission(ctx, "take_message");
    if (denied) return denied;
    const message = String(args.message ?? "").trim();
    if (!message) return { ok: false, error: "Message text is required.", auditEvents: [] };
    return {
      ok: true,
      data: { message, callerName: String(args.callerName ?? ""), callbackNumber: String(args.callbackNumber ?? ""), simulated: true },
      auditEvents: [{ action: "tool.take_message", details: { length: message.length, simulated: true } }],
    };
  },
};

export const TOOL_REGISTRY: Record<string, ToolDefinition> = {
  check_availability: checkAvailabilityTool,
  book_appointment: bookAppointmentTool,
  transfer_to_human: transferToHumanTool,
  take_message: takeMessageTool,
};
