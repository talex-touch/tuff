# Nexus Docs Static Delivery Contract

Rules for how prerendered Nexus docs pages, their JSON, and locale messages reach the browser on
Cloudflare Pages. Companion to [Nexus Docs Rendering](./nexus-docs-rendering-contract.md), which
owns what is *in* the HTML; this file owns how many round trips it takes to *use* it.

Measured 2026-09-11 from CN against `tuff.tagzxia.com` (routed to LAX, 1–2 s per round trip): a
component page took 45 s cold / 7 s warm to render its first demo, and JS execution was under a
second of that. Everything below removes a round trip or makes one cacheable. See
`.trellis/tasks/09-11-nexus-perf/prd.md` for the full baseline.

## Prerendered HTML is `<route>.html`

`nitro.prerender.autoSubfolderIndex: false` in `nuxt.config.ts`. Cloudflare Pages serves
`foo/index.html` only at `/foo/` and answers `/foo` with a 308; it serves `foo.html` at `/foo`
directly. Every in-app link, canonical and alternate tag is slash-less, so the subfolder layout
put a redirect in front of every direct visit.

Consequences that must stay true together:

- `build/materialize-docs-index-aliases.mjs` copies each `<dir>/index.html` (the prerender of
  `/en/docs/dev/index`) to `<dir>.html` so the directory route `/en/docs/dev` has a static file.
  The docs root aliases `en/docs/index.html` → `en/docs.html`.
- `build/check-worker-bundle.mjs::routeToDistPath` maps routes to `<route>.html`; the landing
  files are `index.html`, `new.html`, `next.html`; docs detail/root classifiers match `.html`
  directly under `en|zh/docs/`.
- `_routes.json` excludes are derived by nitro from the file list with `.html` stripped, so the
  `/en/docs/*` patterns in `cloudflare.pages.routes.exclude` still cover every page.
- `/foo/` (with slash) now 308s to `/foo`. That is the mirror of the old behaviour and only
  affects links copied after being redirected; do not add a redirect rule to "fix" it.

## Static docs responses carry an edge cache window

`build/nexus-static-routes.mjs` owns `DOCS_STATIC_CACHE_CONTROL`, `I18N_MESSAGES_CACHE_CONTROL`
and `createStaticCacheRouteRules()`; `nuxt.config.ts` spreads those into `routeRules` and nitro
writes them to `dist/_headers`. Without them Pages emits `max-age=0, must-revalidate` for every
static file and the edge shows `DYNAMIC` — each docs visit re-fetched HTML and JSON that only
change on deploy.

- Docs HTML and prerendered docs JSON: browser 5 min, edge 1 h, stale-while-revalidate 1 day.
  The window matches the dynamic docs API's `DOCS_CONTENT_CACHE_CONTROL`. A deploy changes the
  hashed asset names inside the HTML; an hour-old edge copy still points at assets that exist.
- `/_i18n/**` is hash-versioned in its path and may be held for a day at the edge.
- Prerendered JSON has no extension, so Pages guessed `application/octet-stream`; the rule sets
  `content-type: application/json` too.
- `checkStaticCacheHeaders()` in the worker-bundle guard parses `_headers` and fails the build
  when any of these blocks is missing, loses `s-maxage`, or loses the JSON content type. Change
  the constants, never the guard, when the window needs to move.

## Locale messages ride in the HTML and never gate hydration

`i18n.experimental.preload` + `stripMessagesPayload` put the keys the SSR render used into a
`<script data-nuxt-i18n>` block (measured 1 KB on a component page against a 9 KB fetch).
nuxt-i18n 10.4 still `await`s its own `/_i18n/<hash>/<locale>/messages.json` fetch inside the
`route-locale-detect` plugin before the app mounts, preload or not — the payload only merges
what was rendered. `app/plugins/i18n-preload-hydration.client.ts` (`enforce: 'pre'`) intercepts
the `_nuxtI18n` context assignment and wraps `loadMessages` so that, while hydrating a preloaded
page, the fetch is started but not awaited; the result merges reactively when it lands, and a
later caller for the same locale reuses the deferred promise instead of fetching again.

- Keys rendered only on the client after mount (lazy footer, outline, comments) show their
  fallback until that fetch resolves — the same window in which those components are still
  downloading their own chunks. `useI18nPreloadKeys([...])` in a component's setup forces keys
  into the payload if a flash is ever visible.
- If nuxt-i18n stops assigning `_nuxtI18n`, the interceptor never fires and behaviour returns
  to the awaited fetch: slower, never broken. The guard is `docs-page-performance.test.ts`.

## One navigation request, no session request, on public docs pages

- The docs page pager and `DocsSidebar` share the `docs-navigation:<locale>:<scope>` key with
  `dedupe: 'defer'`. Nuxt's default `'cancel'` restarted the request for the second subscriber,
  so the tree left the browser twice per page.
- `app.vue` settles the session as signed-out without a request on public routes when the
  non-httpOnly `nexus_session_hint` cookie (`shared/utils/session-hint.ts`) is absent. The auth
  handler writes and clears that cookie by reading its own outgoing `Set-Cookie` headers for a
  session token; the hint carries nothing and a forged one only causes the request the page
  would have made anyway. Protected routes and the auth shell always ask the server.

## Demo chain

`TuffDemoWrapper` starts `loadDemoRegistry()` (`demo-registry-loader.ts`, one shared dynamic
import) the moment a demo activates, so the registry chunk downloads in parallel with the client
renderer chunk instead of after it. The registry must never be a static import of the wrapper —
it is 370+ dynamic imports and would enter the SSR graph of every docs page.
