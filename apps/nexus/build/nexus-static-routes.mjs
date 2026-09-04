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

