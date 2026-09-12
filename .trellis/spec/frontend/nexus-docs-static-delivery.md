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

## Client-side navigation reads static JSON twins

Every docs page is also prerendered as `/api/docs/page/<locale>/<meta|body>/<path>.json`
(`build/docs-prerender-routes.ts::createDocsPageApiPrerenderRoutes`, ~1 100 files). The client
(`app/utils/docs-page-client-cache.ts::requestDocsPage`) reads that twin first and falls back
exactly once to `/api/docs/page?path=…`, the Worker route that also serves development and any
document outside the list. The resolver behind both fronts is `server/utils/docsPageResolver.ts`.

- The route is path-shaped because a query string never becomes a file on Pages (why
  `af99441e0` was reverted). The `.json` suffix keeps the MIME guess right on its own.
- Pages caps `_routes.json` at 100 entries and nitro fills it one prerendered file at a time;
  the twins are covered by the `/api/docs/page/*` pattern in `cloudflare.pages.routes.exclude`
  or most of them silently fall back to the Worker. The guard checks the pattern is present.
- `docsStaticJsonHeaderRoutes` includes `/api/docs/page/**`, so the twins carry the docs cache
  window and `application/json`.

## Sentry loads after mount

`@sentry/nuxt` registers two client plugins that run before the app mounts and `await` the SDK
import (~140 KB gzip, one round trip). `nuxt.config.ts` removes them in `app:resolve`
(`removeSentryClientPlugins`) and `app/plugins/sentry-deferred.client.ts` loads the SDK on the
first idle slot after `app:mounted`, with `app/utils/sentry-deferred.ts` buffering `error` /
`unhandledrejection` events in the gap and replaying them once the SDK is up.
`sentry.client.config.ts` exports `initSentryClient()` and must stay side-effect free on
import. `runtimeConfig.public.sentryClientEnabled` is what the deferred loader reads, since the
module's own client plugins are gone.

## The icons layer loads after mount

`app/plugins/unocss-icons.client.ts` imports `uno:icons.css` on `app:mounted`. UnoCSS then
leaves the icons layer out of the `uno.css` entry, so the render-blocking shared stylesheet drops
from 68 KB to 29 KB gzip and the 184 KB of inline SVG arrive as a separate, cacheable asset once
the page is interactive. A preflight in `uno.config.ts` sizes every `i-*` box at its final
1.2em so glyphs paint in without moving anything. The guard requires the entry CSS to carry no
`--un-icon:` rule and applies the per-glyph budgets to the icons sheet instead.

## Chunk floor, and why styles are not inlined

`vite.build.rollupOptions.output.experimentalMinChunkSize: 4096` folds sub-4 KB chunks into an
importer (1157 → 952 client chunks, 61 → 50 preloads on a component page, bytes unchanged).
Nuxt's `features.inlineStyles` was tried with it and reverted: tuffex ships its styles as `.css`
files imported from inside SFCs by the on-demand style plugin, so Nuxt inlined them *and* kept
them linked — 78 KB of duplicated CSS and +10 KB gzip per docs page for no fewer requests. Do
not re-enable it without first making the tuffex sheets inline-only or link-only.

## Early Hints

`build/write-early-hints.mjs` runs after the alias step and gives each route family (`/`, each
public route, `/en/docs/*`, `/zh/docs/*`) a `Link` header naming the entry script
(`rel=modulepreload`) and the stylesheets every sample page of that family shares
(`rel=preload; as=style`). Pages turns `preload`/`preconnect` `Link` headers in `_headers` into
`103 Early Hints`, so the browser fetches the entry CSS during the HTML round trip. Names are
read from the built HTML, never written into config.

Three facts about `_headers` shape the output; the guard (`checkEarlyHints`,
`checkHeadersFileLimits`) fails the build when any is violated:

- Pages keys rules by pattern, so a second `/en/docs/*` block *replaces* the first — the first
  attempt lost the docs cache window that way. The `Link` line is merged into the block nitro
  wrote for the pattern; only patterns nitro did not write get a block of their own, under the
  marker. `parseCloudflareHeadersFile` mirrors that reading (comments skipped, last block wins).
- Every entry carries `crossorigin`, because Nuxt renders every `<link>` and `<script>` with it.
  A preload whose credentials mode differs is never matched to the tag: on the first attempt
  Chrome downloaded every hinted stylesheet twice and logged "request credentials mode does not
  match".
- Lines over 2 000 characters and rules past the 100th are dropped, with a warning only in
  wrangler's output. `formatLinkHeader` adds entries in document order and stops before the cap,
  so the landing page's thirty-odd sheets lose the tail of the list, never the entry.

`wrangler pages dev` does not emit 103 responses, so the gain is only measurable on a deploy;
locally the guard and the absence of duplicate downloads are the evidence.
