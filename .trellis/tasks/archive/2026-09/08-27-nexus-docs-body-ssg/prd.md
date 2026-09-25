# Nexus docs true SSG: prerender doc body into HTML

## Problem

Production docs pages (tuff.tagzxia.com) are prerendered as metadata-only shells: the
HTML for every `/en|zh/docs/**` page contains the title, nav, and frontmatter meta but
zero body content (verified 2026-08-27: `button` and `guide/start` HTML have no `<h2>`
and no body text). The body is fetched client-side, after an idle delay
(180ms + `requestIdleCallback` up to 1.2s), from `/api/docs/page?...&body=1`, which is:

- served dynamically by the CF worker + D1 on every request (`cf-cache-status: DYNAMIC`,
  no cache headers);
- 1.4–5s per request measured from a CN network (TLS to CF edge alone 0.8–2.9s), with
  intermittent connection resets (10/265 probes failed with curl code 000);
- not retried on failure: `loadFullDocForRoute` catch nulls the body, leaving the page
  permanently empty (no error state, no retry) until a manual reload.

Net effect: docs pages take 2–6.5s to show content on a good day and never load on a bad
network. Crawlers also receive empty shells (SEO impact).

History: `af99441e0` prerendered component-doc API payloads, but the routes carried query
strings, which cannot materialize as distinct static files on Pages; `88df316b7`
("unblock pages build") gutted it back to fully dynamic.

All 530 doc routes (265 en + 265 zh on origin/master) currently return HTTP 200 — this is
not a missing-page problem; it is an empty-shell + fragile-runtime-fetch problem.

## Goal

A prerendered docs page must be readable from its HTML alone: first paint of the full
body comes from the static HTML with no runtime API dependency. Client-side SPA
navigations may keep the split-body lazy fetch, but it must be resilient (bounded retry +
visible error state with a manual retry affordance) instead of silently blank.

## Requirements

- R1: Prerendered HTML for every docs route contains the rendered body (prose,
  headings, code blocks). Demos may stay lazy/client-mounted.
- R2: On initial load/hydration the client adopts the SSR body without issuing a
  `/api/docs/page` body request.
- R3: Client-side navigations keep the existing metadata-first + idle body fetch flow.
- R4: A failed body fetch retries a bounded number of times, then shows an error state
  with a manual retry action. Never an infinite skeleton, never a silent empty body.
- R5: The full Pages build (`apps/nexus` `build` script incl. post-build scripts)
  completes on CI/CF Pages within memory limits — this is the constraint that killed
  the previous attempt (`88df316b7`), so it is an explicit acceptance gate, not an
  assumption.
- R6: `docs-page-performance.test.ts` is updated to encode the new contract (it
  currently asserts the always-split behavior as literal code strings).

## Non-goals / out of scope

- Edge cache headers for `/api/docs/page` (adjacent improvement; record as follow-up).
- Enabling `payloadExtraction` or stripping the body from `__NUXT_DATA__` to halve HTML
  size (follow-up if page weight becomes a concern).
- The dev-only intra-body deferral (`shouldDeferDocBodySections`) — untouched.
- Dev-server performance (34s Nitro build) — unrelated.

## Acceptance Criteria

- [ ] After a local production build, `.output/public/en/docs/dev/components/button/index.html`
      and `.../guide/start/index.html` contain rendered body markup (`<h2`, body text),
      and a spot-check of ≥5 more routes across sections passes.
- [ ] The initial page load issues no `/api/docs/page` request (verified in devtools /
      by instrumentation in a browser session against the built output).
- [ ] SPA navigation to another doc still lazy-loads the body and renders it.
- [ ] Simulated body-fetch failure (offline/blocked API) on SPA navigation shows the
      error state with a retry button; retry succeeds once the API is reachable.
- [ ] Full `build` script completes; record peak memory/build time delta vs. baseline.
- [ ] `docs-page-performance.test.ts` (and any other nexus tests touching the docs page)
      pass with assertions updated to the new contract.
- [ ] Post-deploy: production HTML for a component doc contains body text
      (curl + grep, same probe as the investigation).
