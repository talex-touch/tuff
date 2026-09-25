export const publicPrerenderRoutes = [
  '/',
  '/new',
  '/next',
  '/pricing',
  '/license',
  '/privacy',
  '/protocol',
  '/updates',
  '/store',
  '/login',
  '/sign-in',
  '/verify-waiting',
  '/device-auth',
]

/**
 * The not-found page, prerendered under a private route and copied to `404.html` by
 * `build/materialize-not-found.mjs`. Cloudflare Pages answers every not-found path with the
 * top-level `404.html` when one exists, and without it treats the project as a single-page app
 * and serves `index.html` with a 200 instead. `/en/docs/*` is excluded from the Worker, so a
 * missing docs page could only ever be answered by Pages itself — measured 2026-09-23, an
 * unknown docs URL returned the landing page, 191 KB, status 200.
 *
 * Why not prerender `/404.html` directly: that route came out of Nuxt as a no-SSR shell — an
 * empty `#__nuxt`, no title, no text (3.6 KB, measured 2026-09-24), the single-page fallback
 * treatment of that file name — so the reader would get a blank page until hydration. A route
 * with an ordinary name is server-rendered like every page. Kept apart from
 * `publicPrerenderRoutes`: it is not a route readers visit, so it gets no early hints and no
 * `_routes.json` expectation.
 */
export const NOT_FOUND_PRERENDER_ROUTE = '/__not-found'
export const staticFallbackPrerenderRoutes = [NOT_FOUND_PRERENDER_ROUTE]

/**
 * `_redirects` rules Pages applies before it looks for a static file, so the unprefixed docs
 * entry points never reach the Worker. `server/middleware/docs-legacy-redirect.ts` keeps the
 * same mapping for development (the node-server preset reads no `_redirects`) and as the
 * Worker fallback; `test/middleware/docs-legacy-redirect.test.ts` holds the two to the same
 * answer. Nitro cannot write these from `routeRules`: it copies `to` verbatim, so a wildcard
 * destination never becomes `:splat`. `build/write-static-redirects.mjs` writes them instead.
 */
export const docsStaticRedirects = [
  { from: '/docs', to: '/en/docs', status: 308 },
  { from: '/docs/*', to: '/en/docs/:splat', status: 308 },
]

/**
 * Status codes Pages accepts in `_redirects`. Anything else — Nitro's `/* /404.html 404`
 * fallback included — is dropped by Pages with a warning only in wrangler's output; the real
 * not-found answer comes from the top-level `404.html` itself, no rule needed.
 */
export const PAGES_REDIRECT_STATUSES = new Set([200, 301, 302, 303, 307, 308])

/** A catch-all source; any docs rule listed below one of these never fires. */
export const PAGES_CATCH_ALL_SOURCE = '/*'

export const docsApiPrerenderRoutes = [
  '/api/docs/component-sync',
  '/api/docs/navigation/en/all',
  '/api/docs/navigation/zh/all',
  '/api/docs/navigation/en/components',
  '/api/docs/navigation/zh/components',
  '/api/docs/search/en',
  '/api/docs/search/zh',
  '/api/docs/sidebar-components/en',
  '/api/docs/sidebar-components/zh',
]

/**
 * The docs routes whose prerendered output is treated as release evidence. Consumed by
 * `createNexusPrerenderEvidence` in `nexus-prerender-routes.ts`.
 *
 * Lives in this `.mjs` rather than beside its consumer so plain-node tooling can read it: the TS
 * modules in `build/` import each other without file extensions, which node cannot resolve without
 * a loader. Any such tool must import this list rather than restate it -- a second copy that drifts
 * from this one is the failure the list exists to prevent.
 */
export const docsPrerenderEvidenceRoutes = [
  '/docs',
  '/docs/dev',
  '/docs/dev/getting-started/quickstart',
  '/docs/dev/components',
  '/docs/guide/start',
]


/**
 * `cache-control` for prerendered docs output on Cloudflare Pages. Pages emits
 * `max-age=0, must-revalidate` for every static file unless `_headers` says otherwise, so
 * each docs visit re-fetched HTML and JSON that only change on deploy — from CN a 1–2 s
 * round trip apiece. Nitro writes these route rules into `dist/_headers`.
 *
 * Browser window (`max-age`) matches the dynamic docs API's 5 minutes. The edge window is the
 * same 5 minutes and carries no stale-while-revalidate: Cloudflare only caches HTML/JSON behind
 * the zone Cache Rule "nexus docs static" (created 2026-09-24, Edge TTL "ignore origin, 5 min"),
 * a Pages deploy does not purge that cache, and a deploy replaces changed chunks under new
 * hashes — so a copy older than a few minutes may point at assets that no longer exist. Keep this
 * value and the rule's TTL equal. `/_i18n/**` is hash-versioned in the path, so it can be held
 * longer.
 */
export const DOCS_STATIC_CACHE_CONTROL = 'public, max-age=300, s-maxage=300'
export const I18N_MESSAGES_CACHE_CONTROL = 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800'

/**
 * The docs roots are listed on their own because a Pages pattern `/en/docs/*` matches paths
 * below the root and not the root itself — `/en/docs` shipped with the Pages default
 * `max-age=0, must-revalidate` while every page below it carried the window.
 */
export const docsStaticHtmlHeaderRoutes = ['/en/docs', '/zh/docs', '/en/docs/**', '/zh/docs/**']
/**
 * Prerendered JSON has no file extension, so Pages served it as `application/octet-stream`;
 * the explicit content-type is part of the same rule.
 */
export const docsStaticJsonHeaderRoutes = [
  '/api/docs/page/**',
  '/api/docs/navigation/**',
  '/api/docs/search/**',
  '/api/docs/sidebar-components/**',
  '/api/docs/component-sync',
]
/**
 * The raw Markdown twins (`/<locale>/docs/<path>.md`) deliberately have no header rule of their
 * own. They already match `docsStaticHtmlHeaderRoutes`, so they inherit the docs cache window,
 * and their content type comes from the real `.md` extension — the thing the extension-less
 * JSON above had to state explicitly. A `/en/docs/**.md` rule would be worse than redundant:
 * the route matcher treats `**` as a catch-all and ignores the suffix, so such a rule also
 * matches every docs HTML page and would serve it as Markdown.
 */
export const i18nMessagesHeaderRoutes = ['/_i18n/**']

/**
 * Documented Cloudflare Pages limits for `_headers`. Past them a line, or the rest of the file,
 * is dropped with a warning only in wrangler's output — every header past the limit quietly
 * stops being sent.
 */
export const CLOUDFLARE_HEADERS_MAX_RULES = 100
export const CLOUDFLARE_HEADERS_MAX_LINE_LENGTH = 2000

export function createStaticCacheRouteRules() {
  const rules = {}
  for (const route of docsStaticHtmlHeaderRoutes)
    rules[route] = { headers: { 'cache-control': DOCS_STATIC_CACHE_CONTROL } }
  for (const route of docsStaticJsonHeaderRoutes) {
    rules[route] = {
      headers: {
        'cache-control': DOCS_STATIC_CACHE_CONTROL,
        'content-type': 'application/json; charset=utf-8',
      },
    }
  }
  for (const route of i18nMessagesHeaderRoutes)
    rules[route] = { headers: { 'cache-control': I18N_MESSAGES_CACHE_CONTROL } }
  return rules
}
