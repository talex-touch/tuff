import { createDocsPrerenderRoutes } from './docs-prerender-routes'
import { toLocalizedDocsPaths } from '../shared/utils/docs-path'

export const publicPrerenderRoutes = [
  '/',
  '/next',
  '/pricing',
  '/license',
  '/privacy',
  '/protocol',
  '/updates',
  '/store',
  '/sign-in',
  '/forgot-password',
  '/verify-waiting',
  '/device-auth',
] as const

export const docsApiPrerenderRoutes = [
  '/api/docs/component-sync',
  '/api/docs/navigation',
  '/api/docs/sidebar-components',
] as const

export const docsPrerenderEvidenceRoutes = [
  '/docs',
  '/docs/dev',
  '/docs/dev/getting-started/quickstart',
  '/docs/dev/components',
  '/docs/guide/start',
] as const

export function createNexusPrerenderRoutes(nexusRoot: string) {
  return [
    ...new Set([
      ...publicPrerenderRoutes,
      ...docsApiPrerenderRoutes,
      ...createDocsPrerenderRoutes(nexusRoot),
    ]),
  ]
}

export function createNexusPrerenderEvidence(nexusRoot: string) {
  const docsRoutes = createDocsPrerenderRoutes(nexusRoot)
  const routes = createNexusPrerenderRoutes(nexusRoot)
  const routeSet = new Set(routes)
  const requiredDocsRoutes = docsPrerenderEvidenceRoutes.flatMap(route => toLocalizedDocsPaths(route))
  const staticWorkerRoutes = [
    ...publicPrerenderRoutes,
    ...docsApiPrerenderRoutes,
    ...requiredDocsRoutes,
  ]

  return {
    publicRoutes: [...publicPrerenderRoutes],
    docsApiRoutes: [...docsApiPrerenderRoutes],
    docsRoutes,
    requiredDocsRoutes,
    staticWorkerRoutes,
    missingRequiredDocsRoutes: requiredDocsRoutes.filter(route => !routeSet.has(route)),
    routeCount: routes.length,
    docsRouteCount: docsRoutes.length,
  }
}
