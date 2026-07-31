# Design: Nexus end-to-end debugging

## 1. Flow map

```text
browser route
  -> Nuxt route/page middleware
  -> SSR/prerender metadata and localized content
  -> client hydration/composables
  -> public or auth-gated server API
  -> normalization/service utility
  -> synthetic local binding or public read-only upstream
  -> UI/error/recovery state
```

The pass samples each route family and boundary. It does not enumerate every admin
mutation endpoint or every component doc.

## 2. Verification matrix

| Layer | Evidence |
| --- | --- |
| Static | Route ownership, middleware, SSR guards, binding access, error normalization |
| Focused contract | Docs/store/release/auth/API tests, page performance, build guards |
| Full gate | Nexus full Vitest, typecheck, route tree, build, Worker analysis |
| Local runtime | `dev:pure`, optional local Wrangler with synthetic bindings, curl/API probes |
| Browser | Fresh CDP profile, desktop/mobile, both docs locales, console/network/DOM |
| Public read-only | No-cookie GET/HEAD status/schema checks only |

`check-runtime-evidence` validates existing sidecar consistency; it does not prove that
the current run generated deployed evidence. The strict deployed gate stays with #324.

## 3. Runtime modes

### Pure Nuxt

Run pure Nuxt on a selected free loopback port for SSR, hydration, locale, route, and
unauthenticated-shell behavior that does not need Cloudflare bindings. Use `dev:pure`
when port 3200 is free; otherwise invoke `nuxt dev` directly with the selected port.

### Local Cloudflare

After a successful build, use the repository's local Wrangler preview with synthetic
secrets and disposable local bindings. Do not connect production D1/R2 or use remote
mode. If local bindings are absent, classify those paths as environment-only and rely
on focused tests/build guards.

### Browser

Launch an available Chromium browser with a fresh `/tmp` user-data directory and CDP.
A task-local diagnostic harness may reuse `scripts/audit-cdp-client.mjs` primitives to
capture route status, H1/title, locale, console/page errors, failed requests, overflow,
hydration warnings, and screenshots. Raw HAR/screenshots stay ignored or temporary.

## 4. Route and API sample

Browser route families:

- landing: `/`, `/new/`, `/next/`
- public product: `/store/`, `/pricing/`, `/updates/`
- auth shell: `/sign-in/`, `/auth/app-callback/`
- docs: `/en/docs/...` and `/zh/docs/...` index/detail
- protected shell: `/dashboard/` while logged out

API families:

- docs search/navigation/sidebar/page
- store list/search and release list/signing metadata
- auth session/providers or equivalent unauthenticated shell
- one representative protected Dashboard endpoint expecting 401
- sync retired/compatibility boundaries through existing tests only unless GET-safe

## 5. Candidate rules

Expected local fallback content, missing optional Cloudflare bindings, unauthenticated
401, absent OAuth provider credentials, historical runtime evidence, and static server
API 404 behavior documented in `TODO-nexus.md` are not defects by themselves.
Candidates require current reachability, stable expected/actual mismatch, source owner,
and one acceptance boundary not already covered by #324/#327/#329/#332.

## 6. Evidence and cleanup

Use bounded response samples and strip cookies, signed queries, tokens, DSNs, personal
paths, and full HTML/HAR from durable reports. Supervise Nuxt/Wrangler/Chrome PIDs,
close targets, terminate servers, remove browser state, and keep product source clean.
