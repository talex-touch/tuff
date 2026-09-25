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

## Static docs responses carry a cache window, and the edge needs a rule to honour it

`build/nexus-static-routes.mjs` owns `DOCS_STATIC_CACHE_CONTROL`, `I18N_MESSAGES_CACHE_CONTROL`
and `createStaticCacheRouteRules()`; `nuxt.config.ts` spreads those into `routeRules` and nitro
writes them to `dist/_headers`. Without them Pages emits `max-age=0, must-revalidate` for every
static file, so browsers re-validated HTML and JSON that only change on deploy.

What the headers do and do not buy, measured 2026-09-23 against production:

- The browser window (`max-age=300`) works as written.
- The edge does not cache docs HTML, the JSON twins, the `.md` twins or `/_i18n/*` on the
  strength of `s-maxage` alone: every one of them answered `cf-cache-status: DYNAMIC` on the
  second request while `/_nuxt/*.js` went `MISS` → `HIT`. Cloudflare's zone cache caches by file
  extension by default (js, css, fonts, images); HTML, JSON and extension-less paths need a zone
  **Cache Rule** with *Eligible for cache* before any `s-maxage` is read. Pages' own
  per-datacenter asset cache sits behind that layer and is invisible in `cf-cache-status`; the
  server-side wait for one static HTML swung between 0.26 s and 3.2 s, which is what the rule is
  meant to remove.
- A zone cache entry is not purged by a Pages deploy, and a deploy replaces the hashed assets: a
  chunk that changed is gone under its old name. So the rule must not keep HTML for the hour
  `s-maxage=3600` suggests. Set **Edge TTL: ignore origin, 5 minutes**, no
  stale-while-revalidate, scoped to `/en/docs/*`, `/zh/docs/*`, `/api/docs/page/*`,
  `/api/docs/navigation/*`, `/api/docs/search/*`, `/api/docs/sidebar-components/*`,
  `/api/docs/component-sync` and `/_i18n/*`. Never widen it to `/api/docs/*`: `view`, `comments`,
  `feedback`, `engagement` and `assistant` are per-reader. The query-string `/api/docs/page?`
  route stays DYNAMIC on purpose. Cloudflare documents a 2-hour minimum Edge Cache TTL on the
  Free plan; the 5-minute override was nevertheless honoured on this zone — entries answered
  `EXPIRED` / `REVALIDATED` within the hour and no `HIT` carried an `age` above the window. If a
  probe ever shows a `HIT` with `age` > 300, switch the rule's Edge TTL to *Use cache-control
  header if present, bypass cache if not*: `_headers` carries `s-maxage=300`, so the window stays
  the same and the plan minimum no longer applies.
- Evidence, not belief: `pnpm -C apps/nexus probe:docs-edge-cache -- --label <before|after>`
  requests each docs URL twice and writes `output/evidence/docs-edge-cache-<date>-<label>.json`,
  with a hashed `/_nuxt/` asset as the positive control. The rule stays only if the second
  request reads `HIT`/`STALE` and the static-HTML ttfb p50 drops; a chunk-404 incident after a
  deploy removes it. Kept on 2026-09-24: the rule "nexus docs static (HTML/JSON/i18n, 5 min edge
  TTL)" took 28/28 second requests from `DYNAMIC` to `HIT` (`output/evidence/docs-edge-cache-2026-09-24-{before,after}.json`),
  and `DOCS_STATIC_CACHE_CONTROL` was lowered to `public, max-age=300, s-maxage=300` so `_headers`
  and the rule agree.
- `/en/docs` and `/zh/docs` have blocks of their own: a Pages pattern `/en/docs/*` matches below
  the root, not the root, and the roots shipped with the Pages default until 2026-09-23.
- `/_i18n/**` is hash-versioned in its path and may be held for a day at the edge.
- Prerendered JSON has no extension, so Pages guessed `application/octet-stream`; the rule sets
  `content-type: application/json` too.
- `checkStaticCacheHeaders()` in the worker-bundle guard parses `_headers` and fails the build
  when any of these blocks is missing, loses `s-maxage`, or loses the JSON content type. Change
  the constants, never the guard, when the window needs to move.

## `404.html` and `_redirects`: Pages answers the misses and the entry points itself

Cloudflare Pages treats a project without a top-level `404.html` as a single-page app and serves
`index.html` with a **200** for every path no file matches. `/en/docs/*` is excluded from the
Worker, so until 2026-09-23 a mistyped docs URL returned the landing page — 191 KB, status 200: a
soft 404 for crawlers and a flash of the wrong page for readers.

- `staticFallbackPrerenderRoutes` (`build/nexus-static-routes.mjs`) prerenders the not-found
  page under the private route `/__not-found`, and `build/materialize-not-found.mjs` copies it
  to `404.html` and deletes the source file. Two constraints shaped that: Nitro only writes a
  prerendered route that answered 200, so `app/pages/[...all].vue` skips `setResponseStatus(404)`
  for exactly that request while prerendering (`import.meta.prerender && event.path ===
  '/__not-found'`), and a literal `/404.html` route is rendered by Nuxt as its single-page
  fallback shell — an empty `#__nuxt`, no title, no text (measured 2026-09-24: 3.6 KB) — so the
  file must come from a route with an ordinary name. `checkStaticFallback()` rejects an empty
  shell and requires the rendered hero (`aria-label="404"`). Pages serves the file natively for
  every miss; no `_redirects` line is involved. A `404` status is not a status `_redirects`
  accepts (only 200, 301, 302, 303, 307, 308), so the `/* /404.html 404` line Nitro writes when it
  happens to see a `404.html` at compile time is dropped by Pages with a warning in the deploy log;
  `write-static-redirects.mjs` removes any such line and the guard rejects it.
- `/docs` and `/docs/*` redirect to `/en/docs` and `/en/docs/:splat` from `_redirects`
  (`docsStaticRedirects`), written by `build/write-static-redirects.mjs` after nitro. Pages applies
  `_redirects` only to requests it serves itself, so both sources are also in
  `cloudflare.pages.routes.exclude` (`nuxt.config.ts`): left in the Worker's share, the request
  reached `docs-legacy-redirect.ts` first and the static rules never fired (3–5 s TTFB measured
  from CN). Nitro cannot write a splat from `routeRules` — it copies `to` verbatim — which is why
  this is a post-build step and not a route rule. `server/middleware/docs-legacy-redirect.ts`
  keeps the same mapping for development and as the Worker fallback;
  `test/middleware/docs-legacy-redirect.test.ts` holds both to the same answer and records the
  one divergence (a locale-suffixed content name is not normalized by a splat; it now lands on
  the real 404 instead).
- Ordering is part of the contract: static rules before dynamic rules, and every docs rule above
  any `/*` catch-all, because Pages reads the file top to bottom. `checkStaticRedirects()` and
  `checkStaticFallback()` in the worker-bundle guard fail the build when a rule is missing, points elsewhere, carries a
  status Pages rejects, or is out of order, and `checkRoutes()` fails it when `/docs` or `/docs/*` is missing
  from `_routes.json`. `wrangler pages dev dist` honours `_redirects` and `404.html`, so the
  local acceptance is four curls: `/docs/dev` → 308,
  `/docs/dev/components/button.md` → 308 with the suffix kept, `/en/docs/nope` → 404 with the
  Nuxt page, `/en/docs/dev/components/button` → 200 with its body.

### Contracts: static fallback and entry redirects

- **Signatures** (`build/nexus-static-routes.mjs`, plain-node importable):
  `NOT_FOUND_PRERENDER_ROUTE = '/__not-found'`, `staticFallbackPrerenderRoutes = [NOT_FOUND_PRERENDER_ROUTE]`,
  `docsStaticRedirects: Array<{ from, to, status }>` (`/docs → /en/docs 308`, `/docs/* → /en/docs/:splat 308`),
  `PAGES_REDIRECT_STATUSES = Set{200, 301, 302, 303, 307, 308}`, `PAGES_CATCH_ALL_SOURCE = '/*'`,
  `docsStaticHtmlHeaderRoutes` includes the two roots. Post-build: `materializeNotFoundPage(distRoot)`
  → `{ bytes }` (throws on missing source / empty shell / missing `aria-label="404"`),
  `mergeStaticRedirects(source, rules)` → file text (drops lines whose status Pages rejects),
  `writeStaticRedirects(distRoot)`.
  Guards (exported from `build/check-worker-bundle.mjs`): `checkStaticRedirects(source, rules)`,
  `checkStaticFallback({ notFoundHtml })`, `isExcludedFromWorker(route, excludedSet)`.
  Probe: `node scripts/probe-docs-edge-cache.mjs [--base-url https://…] [--label <name>]`.
- **File contracts**: `_redirects` lines are `<from> <to> <status>` (Nitro writes tabs; the parser
  accepts any whitespace), static sources before dynamic (`*` / `:param`) sources, every docs rule above any `/*`
  catch-all, statuses only from `PAGES_REDIRECT_STATUSES`.
  `_routes.json.exclude` must contain every `docsStaticRedirects[].from` verbatim.
- **Validation and error matrix** (each is a gate finding, build fails): `<from>: no _redirects rule`;
  `<from>: redirects to X S, expected Y T`; `<from>: listed after the /* catch-all; Pages reads rules in order`;
  `<from>: static rule listed after dynamic rules; …`; `404.html is missing from dist; …`;
  `404.html is an empty no-SSR shell; …`; `404.html does not contain the rendered not-found page (aria-label="404")`;
  `<line>: status 404 is not a _redirects status Pages accepts; the line is dropped with a warning`; `Missing static route exclusions: … /docs, /docs/*`.
- **Cases**: Good — `/docs/dev` → 308 from Pages with a 0-byte body, `/en/docs/nope` → 404 with the
  rendered page. Base — `/en/docs/dev/components/button` → 200 unchanged, `/this-does-not-exist` →
  Worker 404 unchanged. Bad — `/docs/dev/api/box.en.md` → `/en/docs/dev/api/box.en.md` → 404 (a splat
  cannot normalise a content name; accepted and recorded in the middleware parity test).
- **Tests**: `build/static-redirects.test.ts` (writer order/idempotency, every finding string with a
  positive control), `build/materialize-not-found.test.ts` (copy + delete, shell rejection),
  `build/docs-prerender-routes.test.ts` (route present, carve-out literal matches the constant),
  `test/middleware/docs-legacy-redirect.test.ts` (middleware ≡ static rules on canonical paths, one
  documented divergence), `build/static-cache-headers.test.ts` (root blocks).
- **Wrong vs correct**: adding `/404.html` to the prerender list and trusting the file — Nuxt emits an
  empty shell for that name. Correct: prerender `/__not-found`, copy it, assert the content. Wrong:
  writing `_redirects` rules for a path still in the Worker's `_routes.json` share — they never run.
  Correct: exclude the source path and let the gate assert it. Wrong: a `/* /404.html 404` line
  (Nitro's habit) — Pages rejects the status and warns. Correct: no line at all; the top-level
  `404.html` is served natively.

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
