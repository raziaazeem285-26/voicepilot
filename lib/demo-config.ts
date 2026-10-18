// Bundled fallback config for the public /demo route.
// Used when the database is unavailable (e.g. before the production Postgres
// is connected). Mirrors the "home-services" AgentTemplate in prisma/seed.ts.
// Everything that runs against it is SIMULATED regardless of source.
import { defaultAgentConfig, type AgentConfig } from "./agent-config";

export function demoHomeServicesConfig(): AgentConfig {
  const cfg = defaultAgentConfig();
  cfg.identity = { businessName: "Apex Home Services", agentName: "Sam" };
  cfg.purpose = "Triage home-service requests, identify emergencies, and book service visits.";
  cfg.systemInstructions =
    "You are the AI dispatcher for a home-services company (HVAC, plumbing, electrical). First determine if this is an emergency " +
    "(no heat in winter, flooding, gas smell, sparking). For gas smells or sparking: tell the caller to leave the area and call emergency services, then offer to transfer. " +
    "For other jobs, qualify and book a visit window. Never quote exact prices — give ranges only if approved, else transfer.";
  cfg.greeting =
    "Thanks for calling Apex Home Services. I'm Sam, the AI assistant. What can we help with — heating, cooling, plumbing, or electrical?";
  cfg.qualificationQuestions = [
    { id: "issue", question: "Can you describe the issue briefly?", required: true },
    { id: "emergency", question: "Is this urgent — for example no heat, active leak, or sparking?", required: true },
    { id: "address", question: "What's the service address?", required: true },
  ];
  cfg.appointmentRules = { enabled: true, slotMinutes: 120, leadTimeHours: 2, maxDaysAhead: 14, confirmBeforeBooking: true };
  cfg.businessHours = {
    timezone: "America/New_York",
    days: { "0": ["08:00", "20:00"], "1": ["07:00", "19:00"], "2": ["07:00", "19:00"], "3": ["07:00", "19:00"], "4": ["07:00", "19:00"], "5": ["07:00", "19:00"], "6": ["08:00", "18:00"] },
    holidays: [],
  };
  cfg.transferConditions = ["gas smell or sparking reported", "caller asks for a human", "price negotiation"];
  cfg.prohibitedActions = ["quote exact prices", "dispatch without address", "give DIY electrical/gas repair instructions"];
  cfg.allowedActions = ["answer_faq", "check_availability", "book_appointment", "take_message", "transfer_to_human"];
  return cfg;
}
