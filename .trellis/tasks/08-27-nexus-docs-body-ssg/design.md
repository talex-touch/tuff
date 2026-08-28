# Design — Nexus docs true SSG

## Verified facts the design rests on (2026-08-27 investigation)

- `ContentRenderer` for the doc body is NOT inside `<ClientOnly>` — SSR renders prose as
  soon as the doc record carries a `body` (`[...slug].vue` ~line 1949–1981). `ClientOnly`
  only wraps engagement/analytics/comments panels.
- The intra-body deferral (`shouldDeferDocBodySections`) is `import.meta.dev &&
  import.meta.client` — inert in production builds; no interaction with this change.
- The docs page component remounts on every navigation (in-file comment at ~line 190),
  so a value captured once in `setup()` is stable per page visit.
- `shouldSplitDocsPageBody(path)` returns true for every `/docs/**` route except `/docs`
  and `/docs/index`. Those two already SSR the full body today — they are the positive
  control proving body-SSR works, and the existing template handles a body-bearing doc.
- SSR fetch: `useTypedFetch('/api/docs/page', { key: <path:locale:bodyMode>, immediate:
  import.meta.server || !split })`. During prerender this resolves in-process (no CF/D1).
  On hydration, Nuxt seeds `data` from the payload when the key matches — the client
  must therefore compute the same body mode as the server for the initial visit.
- `seedFullDocFromCurrentDoc()` already adopts `doc.value.body` into `fullDoc` without a
  fetch; the adoption path exists and only needs the body to be present.
- **There are TWO client entry points, and both already gate on body presence** — this is
  what makes the change small:
  - setup-time: `if (import.meta.client) void loadActiveDocForRoute()` (line 461-462).
    On hydration it finds `hasResolvedDoc === true` (doc seeded from payload), skips the
    metadata fetch, then `if (!splitBody || seedFullDocFromCurrentDoc()) return`. Today
    the seed fails (payload has no body) so it falls through to
    `scheduleFullDocFetchForRoute` — the 180ms/idle body request. With a body in the
    payload it returns early and issues nothing.
  - `onMounted` → `startFullDocFetchForRoute()` → same `seedFullDocFromCurrentDoc()`
    short-circuit.
  So no scheduling code needs touching: supplying the body in the SSR payload is
  sufficient to suppress the request on both paths.
- Payload key matching is therefore load-bearing. `useTypedFetch` uses an explicit
  `key` containing the body mode. If the hydrating client computed mode `'0'` while the
  server used `'1'`, the payload lookup misses, `doc` starts null, `loadActiveDocForRoute`
  sees `hasResolvedDoc === false`, blanks the doc, and the SSR-rendered body is thrown
  away into a skeleton — strictly worse than today. Hence the client must compute `'1'`
  while hydrating; `useNuxtApp().isHydrating` is the candidate signal (R4 verifies it
  against the installed Nuxt source).
- Cost accepted: with `payloadExtraction: false` the doc record is inlined in
  `__NUXT_DATA__`, so a body-bearing page carries the body twice (rendered DOM + JSON
  payload). This is the page-weight trade; measured in the build gate.
- Failure path today: `loadFullDocForRoute` catch → `fullDoc = null`, no retry, no error
  UI; `requestDocsPage` has a request cache + pending-dedup layer
  (`docs-page-client-cache.ts`) whose failure-caching semantics must be checked before
  wiring retry through it.
- Build chain: tuffex build → `nuxt build` (NODE_OPTIONS 8G heap) →
  `materialize-docs-index-aliases.mjs` → `trim-content-assets.mjs`. Prerender already
  runs with an 8G heap; the previous body-prerender attempt was reverted for build
  breakage (`88df316b7`), though that attempt failed on query-string API routes
  (un-materializable as static files), not proven memory pressure.

## Core change

**Initial render (SSR/prerender + hydration) always uses `body=1`; the split-body flow
applies only to client-side SPA navigations.**

In `apps/nexus/app/pages/docs/[...slug].vue`:

```ts
// Captured once per mount; page remounts per navigation, so this is per-visit stable.
const adoptServerBody = import.meta.server || useNuxtApp().isHydrating

const shouldRequestMetadataOnlyDocBody = computed(() =>
  !adoptServerBody && shouldSplitDocBody.value)
```

`currentDocsPageBodyMode` then yields `'1'` on the server and on the hydrating client
(same fetch key → payload reuse, no request), `'0'` on later SPA navigations
(unchanged behavior). Everything downstream already works:

- SSR: `doc` carries `body` → `renderDoc` renders it → body lands in prerendered HTML.
- Hydration: payload seeds the same record; `seedFullDocFromCurrentDoc()` adopts it,
  `startFullDocFetchForRoute` short-circuits, zero API calls.
- SPA nav: remount → `adoptServerBody === false` → metadata-first + idle body fetch,
  exactly as today.

`immediate: import.meta.server || !shouldSplitDocBody.value` stays correct: on
hydration `immediate` is false and payload seeding does the work; on SPA navs the
existing explicit fetch flow runs.

### Hydration-mismatch risk (component-doc demos)

Component docs SSR their MDC bodies for the first time; embedded demo components render
through `docsProseComponents`. If a demo wrapper renders different server/client trees,
hydration warnings/mismatches appear. Mitigation: inspect the demo wrapper chain
(`TuffDemoWrapper` / demo-lazy) during implementation; if it is not already
client-gated, gate the demo mount behind `<ClientOnly>` (or mounted-flag) inside the
wrapper — NOT around the whole body. Acceptance includes a browser console check for
hydration warnings on a component doc.

## Resilience change (SPA-nav body fetch)

In `loadFullDocForRoute` / around `requestDocsPage`:

- Bounded retry: up to 2 retries (≈800ms / 2400ms backoff) on rejection, re-checking
  `isStaleDocFetch` before each attempt; a stale route abandons silently (current
  behavior).
- Failure-cache check: verify `requestDocsPage`'s cache/pending layer does not memoize
  rejections (if it does, failed keys must be evicted so retry actually refetches).
- New `fullDocError` ref: set after final failure, cleared on route change and on
  manual retry.
- Template: when the doc is a metadata-only stub and `fullDocError` is set, render an
  inline error block (icon + short message + retry button) in place of the body
  skeleton. Retry triggers an immediate fetch (skips the 180ms/idle scheduling). New
  i18n strings in `i18n/locales/en.ts` + `zh.ts`.
- Invariant preserved: every exit settles the view — no infinite skeleton, no silent
  empty body.

## Test/spec updates

`app/pages/docs/docs-page-performance.test.ts` pins the current source as literal
strings (`shouldSplitDocsPageBody` shape, split wiring). Update assertions to the new
contract: `adoptServerBody` capture exists, metadata-only mode is gated on
`!adoptServerBody`, retry/error affordances exist. Keep the untouched assertions
(engagement-panel deferral etc.) as-is.

## Build-scale risk & pivot plan

530+ routes now SSR full bodies during prerender. Handler-side content caching exists;
heap is already 8G. Acceptance measures build time + peak memory delta against a
baseline recorded BEFORE the change (same machine, same command). If the Pages build
cannot complete within limits, pivot without discarding the client work: keep
`adoptServerBody` and emit **path-shaped** static body payloads (e.g.
`/__docs-body/<locale>/<...path>.json`, no query strings — fixing `af99441e0`'s fatal
flaw) served as static assets, with the page fetching that URL first. That is Plan B;
it is not part of this task's scope unless the build gate fails.

## Post-build scripts

- `materialize-docs-index-aliases.mjs` copies index HTML to directory aliases — copies
  get bigger, semantics unchanged. Sanity-check aliased output still contains the body.
- `trim-content-assets.mjs` trims media assets — confirm it does not touch body markup
  (read before build verification).

## Compatibility / rollout / rollback

- `/api/docs/page` contract untouched (still serves SPA navs and any external callers).
- No `_routes.json`, wrangler, or D1 changes. No server API changes.
- Deploy = normal master push to CF Pages. Rollback = single revert of the commit(s);
  no data or schema involvement.
- HTML grows by rendered body + payload copy (~10–80KB/page). Accepted; payload
  extraction / body-stripping recorded as follow-up in the PRD.
