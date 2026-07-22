# Build and deploy Nexus reverse proxy security design site

## Goal

Create and publicly deploy a responsive technical design site at `https://tuff-reverse-proxy-design.tagzxia.com` that explains the current Nexus reverse-proxy defenses, risk controls, production posture, known gaps, and prioritized remediation plan.

## Background

- The source of truth is the current repository implementation and configuration, not marketing claims.
- The page must work for public readers while retaining enough evidence and direct conclusions for internal engineering review.
- The approved visual direction is a dark security-control-plane surface: graphite background, restrained warning orange, evidence matrices, architecture flow, and high information density without dashboard clutter.
- Production deployment through Wrangler and custom-domain binding are explicitly authorized in this conversation.

## Requirements

- Cover canonical-origin handling, auth-origin trust, CORS, device authorization IP matching, trusted-device/location/session policy, Turnstile, telemetry auto-blocking, docs challenge/PoW, manual IP bans, administrator control channels, defense modes, dual control, and hash-chained audit.
- Separate `implemented`, `partial`, `disabled`, and `gap` states. Do not present repository-declared production settings as enabled when they are false or absent.
- State the critical limitations: client-controllable proxy headers, inconsistent IP resolution, password-login Turnstile not enforced server-side, fragmented IP-ban stores, limited global ban enforcement, and incomplete `ELEVATED` behavior.
- Redact secrets and local credential values. File references may be shown; secret values, tokens, and local environment contents must not appear.
- Provide a concise current-state architecture, evidence-backed control matrix, threat scenarios, production posture, and ordered remediation roadmap.
- Use semantic HTML, keyboard-accessible controls, visible focus states, WCAG AA contrast, responsive layouts, and reduced-motion fallbacks.
- Use a standalone deployment boundary under `apps/reverse-proxy-design/`; do not alter the existing Nexus deployment configuration or route tree.
- Configure a dedicated Wrangler Worker/static-assets deployment with the custom domain `tuff-reverse-proxy-design.tagzxia.com`.

## Acceptance Criteria

- [x] The complete Nexus reverse-proxy and risk-control summary is represented without exposing secrets.
- [x] Every security conclusion is traceable to a repository file or configuration reference shown on the page.
- [x] The page clearly distinguishes current implementation from recommendations and deployment inference.
- [x] Desktop, tablet, and mobile layouts have no horizontal overflow or clipped content.
- [x] Keyboard navigation, focus visibility, landmark structure, and reduced-motion behavior work.
- [x] The production build succeeds with no console errors in a browser smoke test.
- [x] Wrangler deploy succeeds and the custom domain serves the deployed site over HTTPS.
- [x] The final report records the deployed URL and distinguishes local browser evidence from live production evidence.

## Out of Scope

- Changing Nexus security behavior, production secrets, Cloudflare WAF/Access policies, or existing Nexus deployment settings.
- Publishing raw `.env` values, credentials, private audit logs, or operational tokens.
- Claiming Cloudflare Dashboard configuration that is not observable from repository or Wrangler output.

## Technical Constraints

- Use Astro static output with production files under `dist/`.
- Deploy the static assets through a dedicated Cloudflare Worker configured by app-local `wrangler.toml`.
- Bind `tuff-reverse-proxy-design.tagzxia.com` as a Worker custom domain; do not reuse or modify the root Nexus Wrangler configuration.
