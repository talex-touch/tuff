# Design — Nexus prod: cut serial round trips and make docs assets cacheable

## Boundaries

All changes live in `apps/nexus/` (config, `server/`, `app/`, `build/`). No changes to `packages/tuffex` or the auth library. Production deploy (`deploy:cf`) is not run by this task; verification is against the local `dist/` layout, `nuxt preview` and the build guards.

## R1 — Trailing-slash redirect

**Mechanism.** Cloudflare Pages serves `foo/index.html` at `/foo/` and 308-redirects `/foo` → `/foo/`. It serves `foo.html` at `/foo` with no redirect. Nitro's `prerender.autoSubfolderIndex` (default `true`) picks the former layout.

**Change.** `nitro.prerender.autoSubfolderIndex: false` in `nuxt.config.ts`. Every prerendered HTML route then lands at `<route>.html`; `/` stays `index.html`.

**Ripple.**
- `build/materialize-docs-index-aliases.mjs`: currently copies `…/index/index.html` → `…/index.html`. New layout: `…/index.html` (the prerender of `/en/docs/dev/index`) must be copied to `…/dev.html` (the alias for `/en/docs/dev`). Rewrite the walker for `*/index.html` → `<dir>.html` and `en/docs/index.html` → `en/docs.html`. Update its test fixtures.
- `build/check-worker-bundle.mjs::routeToDistPath`: `<route>/index.html` → `<route>.html` (root stays `index.html`); `landingInitialHtmlFiles` → `['index.html', 'new.html', 'next.html']`.
- `_routes.json` excludes are derived by nitro from the file list with `.html` stripped, so `/en/docs/*` patterns (from `cloudflare.pages.routes.exclude`) and the individual public routes remain correct. Verify after build.
- Nitro's `prerender` crawler is off (`crawlLinks: false`), so no link-shape dependency.

## R2 — Locale messages in SSR HTML

**Change.** `i18n.experimental.preload: true` and `stripMessagesPayload: true` in `nuxt.config.ts`. nuxt-i18n then (server) fetches all locale messages via its internal route during SSR, tracks `t()` keys used during render, and appends `<script data-nuxt-i18n>` with only the used keys; (client) `mergePayloadMessages` merges them before `route-locale-detect` runs `loadAndSetLocale`, and `loadMessages` short-circuits while hydrating for a locale already in `loadMap`... except the initial locale is not in `loadMap` on the client. Verify in the browser that no `/_i18n/**` request happens before hydration; if it still does, the fallback is `experimental.prerenderMessages: true` so the hashed `messages.json` is a static asset (already excluded from the worker) rather than a worker route, and R5's cache header makes it edge-cacheable.

**Risk.** Keys resolved outside SSR render (e.g. in `onMounted`) are stripped and must be re-fetched: the preload plugin registers a one-time `beforeResolve` that loads full messages on the first client navigation, and `t()` of a missing key falls back to the key string until then. Docs pages read labels like `docs.demo.loading` in setup (rendered on SSR), so they are tracked. `useI18nPreloadKeys` exists for anything that turns out to be client-only; audit the browser console for missing-key warnings on a docs page and the landing page.

**Second fetch.** The duplicate `/_i18n` request came from `app.vue`'s `initLocale` → `setLocaleSerial` → `setLocale(locale)` after the i18n plugin had already loaded messages. With `preload` on, `loadAndSetLocale` for the same locale returns early (`locale === oldLocale && !ctx.initial`), so the duplicate disappears; verify.

## R3 — One navigation fetch

Both `useTypedFetch` calls share key `docs-navigation:<locale>:<scope>` with `server: false, lazy: true`. In Nuxt 4, a second `useAsyncData` with the same key attaches to the same entry, and `execute()` with `dedupe: 'cancel'` (default) cancels the in-flight promise and re-runs it. Two mounts within the same tick therefore produce two requests, the first aborted at the JS level (the HTTP request still leaves). Set `dedupe: 'defer'` on both call sites so the second subscriber awaits the first promise. Keep the existing `docs-page-performance.test.ts` regexes satisfied and extend them to assert `dedupe: 'defer'`.

## R4 — No session call on public docs

`app.vue` `onMounted` calls `getSession()` whenever `status === 'loading'` (always, on first mount). On public docs pages this is a worker round trip that returns `{}` for the anonymous majority.

**Change.** Add `NEXUS_SESSION_HINT_COOKIE = 'nexus_session_hint'` (non-httpOnly, `sameSite: lax`, 30 days), set to `1` by the auth handler whenever it sends a session-token cookie (sign-in callback) and cleared in `clearAuthCookies`/sign-out. In `useNexusAuth`, add `hasSessionHint()` (client: `document.cookie` lookup; server: request cookie). In `app.vue` `onMounted`: on a route that is not `requiresAuth` and not an auth shell route, if `!hasSessionHint()` set `data.value = null` (status → `unauthenticated`) without fetching. Protected routes, auth routes and any explicit `getSession()` callers (`app-callback.vue`, `useAccountRole`, header user menu) are unchanged.

**Placement of the cookie write.** The Auth.js handler returns a `Response` whose `set-cookie` headers carry the session token; the cleanest hook is in `normalizeAuthResponseResult` when `isSigninActionRequest(event)` or the response sets any `SESSION_COOKIE_NAMES` cookie, and in the `signOut` path. Implemented as a small helper `syncSessionHintCookie(event, response)` that scans `set-cookie` of the outgoing response for a session-token cookie with a non-empty value → set hint; with `Max-Age=0` → clear hint.

**Failure mode.** A signed-in reader whose hint cookie was lost (cleared cookies selectively, or signed in before this deploy) sees the header as signed-out on public pages until they visit a protected route or sign in again; the next `/api/auth/session` on a protected route re-sets the hint. The `useNexusAuth.test.ts` harness stubs `useRequestEvent`/`useRequestHeaders` and calls the root mount with `route.meta = {}`; it must be extended: with no hint cookie the fetch is not called and status is `unauthenticated`; with a hint cookie the existing "fetch once and authenticated" expectation holds.

## R5 — Cacheable docs assets

Nitro's Cloudflare preset writes `routeRules[*].headers` into `dist/_headers` (pattern `/**` → `/*`). Add route rules:

```
'/en/docs/**', '/zh/docs/**': headers cache-control: public, max-age=300, s-maxage=3600, stale-while-revalidate=86400
'/api/docs/navigation/**', '/api/docs/search/**', '/api/docs/sidebar-components/**', '/api/docs/component-sync': same + content-type: application/json; charset=utf-8
'/_i18n/**': cache-control: public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800 (hash-versioned path)
```

`/en/docs/**` also covers the HTML; a redeploy changes hashed asset names, and the HTML is revalidated at the browser after 5 minutes and at the edge after an hour, which matches the existing `DOCS_CONTENT_CACHE_CONTROL` window used by the dynamic API. Prerendered JSON currently has no extension, so Pages guesses `application/octet-stream`; the `content-type` header fixes that. The `_headers` file is also honoured by `wrangler pages dev`, so `preview:cf` shows the headers.

Guard: extend `build/check-worker-bundle.mjs` with a `checkStaticHeaders()` that parses `dist/_headers` and requires a `cache-control` with `s-maxage` for the docs HTML, docs JSON and `_i18n` patterns.

## R6 — Shorter demo chain

Today: wrapper activates → `LazyTuffDemoClientRenderer` chunk (1 KB) → `import('./demo-registry')` (63 KB, 373 lazy imports) → demo chunk → tuffex chunk(s). Two of the four hops carry almost no code.

**Change.** Move the registry import into `TuffDemoWrapper.vue` as a module-scope memoised loader that is started on activation (client only, inside `activateDemo()`), and pass the resolved loader map to the client renderer as a prop. The renderer chunk still exists (it is `.client.vue` and holds the `defineAsyncComponent` plumbing) but its request now runs in parallel with the registry request instead of before it. The wrapper must not statically import `./demo-registry` (SSR boundary test); a dynamic `import()` inside a client-only function keeps it out of the server graph and the test's `not.toContain('./demo-registry')` needs to change to `not.toMatch(/^import .*demo-registry/m)`.

Also add `<link rel="modulepreload">` for the registry chunk? Not possible without knowing the hash at SSR time; skip.

## R7 — Entry vendor chunk

The 511 KB chunk is Nuxt's client entry (`entry.*.js` is renamed by the hash), which includes everything statically reachable from `app.vue` + layouts + plugins. Identified static reach:
- Sentry: `@sentry/nuxt` client plugin + `sentry.client.config.ts` (`browserTracingIntegration` added by the module, replay is not configured; the 64 mentions are the tracing integration + core). Keep Sentry but drop tracing on the client: `__SENTRY_TRACING__: false` is already defined in `vite.define`, so the module's `browserTracingIntegration` branch is dead code — the remaining Sentry bytes are core + vue integration. Not worth a lazy split in this task; leave.
- gsap: reached via `@talex-touch/tuffex/base-anchor` (`base-anchor-motion.ts` does `import('gsap')` dynamically — fine) and `useGlobalSearchState` (dynamic — fine). The `gsap` markers in the entry are from tuffex's `TxBaseAnchor` chunk boundaries, not a static import. Remove from scope; record measurement.
- `TuffFooter`/`TuffShowcase`: `__name:"TuffFooter"` was matched by a name string inside a Nuxt component-map, not the component code (the component list `__name:` shows only Tx* components, app, button, NexusPwaManifest). Remove from scope.

Net R7 change: none beyond documenting; the chunk is dominated by Vue runtime, vue-router, vue-i18n, pinia, unhead, Nuxt app, Sentry core and the Tx components used by `app.vue` (`TxEmptyState` → base-anchor/base-surface/popover/tooltip/icon/spinner). The lever there is `TxEmptyState` in `app.vue`'s two auth gates, which pulls 7 tuffex components into every page's entry; replace with a `LazyTxEmptyState` (Nuxt's `Lazy` prefix works with the registered tuffex components) so the gate chunk loads only on protected routes.

## Data flow / compatibility

- Session hint cookie is additive; absence means "ask when needed" only on public routes.
- Route rule headers only affect static responses; the worker's dynamic `/api/docs/page` keeps its own `cache-control`.
- `.html` layout is a deploy-time change; old deep links with a trailing slash (`/en/docs/foo/`) continue to work because Pages serves `foo.html` for `/foo/`? It does not — Pages 308s `/foo/` → `/foo` when only `foo.html` exists. That is the mirror of today's behaviour and only affects links that were copy-pasted after being redirected; canonical links are slash-less.

## Rollout / rollback

Each requirement is an independent commit; reverting any one commit restores the previous behaviour. R1 and R5 need a deploy to observe; the evidence for them is the `dist/` layout and `_headers` file plus `wrangler pages dev` locally.
