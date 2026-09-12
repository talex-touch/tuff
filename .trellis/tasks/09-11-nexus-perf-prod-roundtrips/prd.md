# Nexus prod: cut serial round trips and make docs assets cacheable

Child of `09-11-nexus-perf`. Baseline numbers and the full request chain are in the parent `prd.md`.

## Goal

On the production build, a component docs page should reach hydration and its first rendered demo with fewer serial network round trips, and the assets on that path should be cacheable at the Cloudflare edge instead of `DYNAMIC`.

## Requirements

### R1 — No trailing-slash redirect on direct entry
Direct navigation to `/en/docs/dev/components/button` (the form every in-app link, canonical and alternate tag uses) must return the page with HTTP 200 and no 308. Prerendered docs HTML must be emitted as `<route>.html` (nitro `prerender.autoSubfolderIndex: false`) so Cloudflare Pages serves the slash-less URL directly.

### R2 — Locale messages do not block hydration with a client fetch
The en/zh messages a docs page needs must be present in the SSR HTML (nuxt-i18n `experimental.preload` with `stripMessagesPayload`), so the client does not fetch `/_i18n/<hash>/<locale>/messages.json` before hydration. A second, identical messages fetch must not happen.

### R3 — Docs navigation is fetched once per page
The docs page pager and `DocsSidebar` share one request for `/api/docs/navigation/<locale>/<scope>` per navigation. Duplicate in-flight requests for the same key are deduped rather than issued twice.

### R4 — Public docs pages do not call `/api/auth/session` on load
`TheHeader` and any other chrome on public docs pages must not trigger a session request unless a session cookie marker indicates the reader may be signed in. Protected routes keep their existing behaviour.

### R5 — Prerendered docs assets are edge-cacheable
Prerendered docs HTML under `/en/docs/**` and `/zh/docs/**`, the prerendered docs JSON (`/api/docs/navigation/**`, `/api/docs/search/**`, `/api/docs/sidebar-components/**`, `/api/docs/component-sync`) and `/_i18n/**` messages carry a `cache-control` that allows edge caching with revalidation, written into `dist/_headers`. Prerendered JSON must be served as `application/json`.

### R6 — Demo mount chain is shorter
Mounting a demo must not require the intermediate `TuffDemoClientRenderer` chunk hop before the registry chunk is requested; the registry stays lazy (it must not enter the SSR wrapper). The demo registry import must be started as soon as the first demo wrapper activates.

### R7 — Entry vendor chunk does not carry Sentry's replay/tracing or landing-only code
Sentry client integrations that are not needed on docs pages (replay) are removed or lazily loaded; landing components (`TuffFooter`, `TuffShowcase`) and gsap must not be statically reachable from the app entry graph.

## Constraints

- Prerendered pages must keep embedding the body (`.trellis/spec/frontend/nexus-docs-rendering-contract.md`).
- Canonical / alternate / JSON-LD URLs must not change form (they are slash-less today and stay so).
- `build/materialize-docs-index-aliases.mjs`, `build/check-worker-bundle.mjs`, `check:runtime-evidence` must be updated for the new file layout instead of being bypassed.
- No change to the auth handler's security behaviour; R4 only skips a request that would return an empty session.

## Acceptance Criteria

- [ ] `curl -I https://<preview>/en/docs/dev/components/button` → 200, no redirect (verified locally against `dist/` layout: `dist/en/docs/dev/components/button.html` exists; `_routes.json` still excludes `/en/docs/*`).
- [ ] Prerendered docs HTML contains a `data-nuxt-i18n` payload and the client does not request `/_i18n/**` before hydration on a docs page (verified in a real browser against `nuxt preview`).
- [ ] One `/api/docs/navigation/en/components` request per page load in a real browser.
- [ ] Zero `/api/auth/session` requests on a public docs page for a reader with no auth cookie.
- [ ] `dist/_headers` contains entries for docs HTML, docs JSON and `/_i18n/*` with a non-zero `max-age`/`s-maxage`; prerendered docs JSON responses carry `content-type: application/json`.
- [ ] Demo activation issues the registry chunk request without an intermediate renderer chunk hop (network waterfall in a real browser shows registry request start ≤ 1 round trip after the wrapper activates).
- [ ] Entry preload set (modulepreload links on a prerendered docs page) shrinks in total gzip bytes versus baseline (281 KB gz over 38 files) and no longer contains `TuffFooter`/`TuffShowcase`/gsap.
- [ ] `pnpm -C apps/nexus run test`, `typecheck`, `build`, `check:api-routes`, `build:analyze-worker` pass.

## Out of scope

- Changing where the site is hosted or routed (LAX vs CN edge).
- Reducing entry CSS icon data URIs (tracked as a follow-up; see parent notes).
