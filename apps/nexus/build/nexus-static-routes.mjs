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
 * Browser window (`max-age`) matches the dynamic docs API's 5 minutes; the edge (`s-maxage`)
 * may keep a copy for an hour and serve it stale while it revalidates for a day. A deploy
 * changes the hashed asset names inside the HTML, so an hour-old edge copy still points at
 * assets that exist (immutable, kept alongside). `/_i18n/**` is hash-versioned in the path, so
 * it can be held longer.
 */
export const DOCS_STATIC_CACHE_CONTROL = 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400'
export const I18N_MESSAGES_CACHE_CONTROL = 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800'

export const docsStaticHtmlHeaderRoutes = ['/en/docs/**', '/zh/docs/**']
/**
 * Prerendered JSON has no file extension, so Pages served it as `application/octet-stream`;
 * the explicit content-type is part of the same rule.
 */
export const docsStaticJsonHeaderRoutes = [
  '/api/docs/navigation/**',
  '/api/docs/search/**',
  '/api/docs/sidebar-components/**',
  '/api/docs/component-sync',
]
export const i18nMessagesHeaderRoutes = ['/_i18n/**']

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
