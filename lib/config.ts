// VoicePilot AI — branding configuration.
// ALL product branding lives here. To rebrand, edit only this file.
export const BRAND = {
  productName: "VoicePilot AI",
  tagline: "AI phone agents for your business",
  logoEmoji: "🎙️",
  supportEmail: "support@example.com",
  // Colors (Tailwind classes referenced in UI)
  primary: "indigo",
} as const;

export type Brand = typeof BRAND;
