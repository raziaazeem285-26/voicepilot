# WordPress / Elementor Integration (design notes)

> The core SaaS is **NOT coupled to WordPress**. VoicePilot runs as a standalone
> Next.js app with its own auth, billing, and UI. Everything below is the
> documented approach for *connecting* a WordPress marketing site to it — no
> WordPress code ships with this prototype. (`Integration.type` already reserves
> the `"wordpress"` string for a future server-side integration row.)

## 1. Marketing-site separation

Keep the marketing site (WordPress/Elementor) and the SaaS (VoicePilot) on
separate hosts/origins:

- `https://voicepilot.ai` (or similar) → WordPress: landing pages, pricing,
  blog, contact forms.
- `https://app.voicepilot.ai` → the Next.js prototype: signup, signin,
  dashboard.

Elementor buttons/links point at the app subdomain:

- "Start free trial" → `https://app.voicepilot.ai/signup`
- "Sign in" → `https://app.voicepilot.ai/signin`

No shared session, no WordPress login bridging in Phase 0/1 — users authenticate
in the SaaS only. This avoids syncing password hashes or session stores across
platforms (a Phase-3 auth hardening item anyway).

## 2. JS widget / iframe on WordPress pages (future)

Goal: let a visitor "talk to a demo agent" from the marketing site. Design:

- SaaS exposes an embeddable playground at
  `https://app.voicepilot.ai/embed/playground?agent=<published-agent-id>` —
  **does not exist yet**.
- The embed is an `<iframe>` with `sandbox="allow-scripts allow-same-origin"`;
  the parent page communicates via `postMessage` only for UI sizing, never for
  credentials.
- **Domain allow-listing**: the SaaS keeps an `embedDomains` list per workspace
  (future column on `Workspace` or `Integration`). The embed endpoint checks
  `Origin`/`Referer` against it and refuses otherwise.
- **Signed requests**: the embed token is a short-lived signed JWT minted by
  the SaaS backend (HMAC with a server secret), scoped to one agent + domain +
  15-minute expiry. The widget fetches it from the SaaS server-to-server, never
  in browser JS — no API keys in Elementor HTML.
- Simulated calls through the widget count against the workspace's usage, same
  as `POST /api/workspaces/[wsId]/simulate`.

Security non-goals: never render session cookies inside the iframe, never let
the widget call workspace APIs directly.

## 3. Server-to-server webhooks (future)

When a WordPress form (e.g. "Book a demo") submits, the site can call a SaaS
endpoint to log the lead or trigger an outbound simulation:

- Endpoint shape (future): `POST /api/integrations/wordpress/lead` with an
  HMAC-signed body (shared secret stored in the `Integration.configEnc` row,
  per-workspace).
- The SaaS verifies the signature exactly like `verifyWebhookSignature`
  (HMAC-SHA256, timing-safe) before processing — same primitive documented in
  WEBHOOKS.md.
- Until the voice bridge exists, "call me back" requests are queued as
  messages/outcomes in `CallLog`, never placed as real calls.

## 4. Future WordPress plugin outline

A thin plugin (not started) would provide:

1. **Shortcode/widget** `[voicepilot-agent id="..." theme="light"]` rendering
   the signed iframe.
2. **Settings page** for the SaaS URL + per-site embed secret (stored via
   `wp_options`, never committed).
3. **Lead sync**: on Elementor form submit, server-side POST to the SaaS lead
   endpoint with the signed payload.

## 5. What exists today

- Nothing WordPress-specific is implemented. No embed route, no signed tokens,
  no WP plugin, no `wordpress` integration rows.
- The schema's `Integration.type` enum comment includes `"wordpress"` so a
  future server-side integration fits the existing model without migration.

Keep it that way until Phase 2/3: marketing integration is a distribution
question, and this prototype's job is validating the core product first.
