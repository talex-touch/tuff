import { createDocsPageApiPrerenderRoutes, createDocsPrerenderRoutes } from './docs-prerender-routes'
import { docsApiPrerenderRoutes, publicPrerenderRoutes } from './nexus-static-routes.mjs'
import { toLocalizedDocsPaths } from '../shared/utils/docs-path'

export { docsApiPrerenderRoutes, publicPrerenderRoutes }

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
      ...createDocsPageApiPrerenderRoutes(nexusRoot),
    ]),
  ]
}

export function createNexusPrerenderEvidence(nexusRoot: string) {
  const docsRoutes = createDocsPrerenderRoutes(nexusRoot)
  const docsPageApiRoutes = createDocsPageApiPrerenderRoutes(nexusRoot)
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
    docsPageApiRoutes,
    docsRoutes,
    requiredDocsRoutes,
    staticWorkerRoutes,
    missingRequiredDocsRoutes: requiredDocsRoutes.filter(route => !routeSet.has(route)),
    routeCount: routes.length,
    docsPageApiRouteCount: docsPageApiRoutes.length,
    docsRouteCount: docsRoutes.length,
  }
}
