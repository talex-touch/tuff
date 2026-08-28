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
 * The docs routes whose prerendered output is treated as release evidence.
 *
 * Lives here rather than in `nexus-prerender-routes.ts` so `check-prerender-bodies.mjs` can read it
 * under plain node: that file's TS siblings use extensionless imports, which node cannot resolve
 * without a loader, and duplicating the list in the checker would let the two drift -- which is the
 * failure this list exists to prevent.
 */
export const docsPrerenderEvidenceRoutes = [
  '/docs',
  '/docs/dev',
  '/docs/dev/getting-started/quickstart',
  '/docs/dev/components',
  '/docs/guide/start',
]

/** Mirrors `DOCS_SUPPORTED_LOCALES` in shared/utils/docs-path.ts, for the same reason. */
export const docsPrerenderLocales = ['en', 'zh']

