import { createDocsMarkdownPrerenderRoutes, createDocsPageApiPrerenderRoutes, createDocsPrerenderRoutes } from './docs-prerender-routes'
import { docsApiPrerenderRoutes, docsPrerenderEvidenceRoutes, publicPrerenderRoutes, staticFallbackPrerenderRoutes } from './nexus-static-routes.mjs'
import { toLocalizedDocsPaths } from '../shared/utils/docs-path'
import { toDocsMarkdownPaths } from '../shared/utils/docs-markdown'

export { docsApiPrerenderRoutes, docsPrerenderEvidenceRoutes, publicPrerenderRoutes, staticFallbackPrerenderRoutes }

function buildNexusPrerenderRouteSet(
  docsRoutes: readonly string[],
  docsPageApiRoutes: readonly string[],
  docsMarkdownRoutes: readonly string[],
) {
  return [
    ...new Set([
      ...publicPrerenderRoutes,
      ...staticFallbackPrerenderRoutes,
      ...docsApiPrerenderRoutes,
      ...docsRoutes,
      ...docsPageApiRoutes,
      ...docsMarkdownRoutes,
    ]),
  ]
}

export function createNexusPrerenderRoutes(nexusRoot: string) {
  const docsRoutes = createDocsPrerenderRoutes(nexusRoot)
  const docsPageApiRoutes = createDocsPageApiPrerenderRoutes(nexusRoot, docsRoutes)
  const docsMarkdownRoutes = createDocsMarkdownPrerenderRoutes(nexusRoot, docsRoutes)
  return buildNexusPrerenderRouteSet(docsRoutes, docsPageApiRoutes, docsMarkdownRoutes)
}

function hasPrerenderEvidenceRoute(routeSet: Set<string>, route: string) {
  return routeSet.has(route) || routeSet.has(`${route}/index`)
}

export function createNexusPrerenderEvidence(nexusRoot: string) {
  const docsRoutes = createDocsPrerenderRoutes(nexusRoot)
  const docsPageApiRoutes = createDocsPageApiPrerenderRoutes(nexusRoot, docsRoutes)
  const docsMarkdownRoutes = createDocsMarkdownPrerenderRoutes(nexusRoot, docsRoutes)
  const routes = buildNexusPrerenderRouteSet(docsRoutes, docsPageApiRoutes, docsMarkdownRoutes)
  const routeSet = new Set(routes)
  const requiredDocsRoutes = docsPrerenderEvidenceRoutes.flatMap(route => toLocalizedDocsPaths(route))
  // Every evidence page must also ship its raw source; the handler behind these routes cannot
  // run in the deployed Worker, so a missing file is a dead URL rather than a slow one.
  const requiredDocsMarkdownRoutes = docsPrerenderEvidenceRoutes.flatMap(route => toDocsMarkdownPaths(route))
  const staticWorkerRoutes = [
    ...publicPrerenderRoutes,
    ...docsApiPrerenderRoutes,
    ...requiredDocsRoutes,
  ]

  return {
    publicRoutes: [...publicPrerenderRoutes],
    docsApiRoutes: [...docsApiPrerenderRoutes],
    docsPageApiRoutes,
    docsMarkdownRoutes,
    docsRoutes,
    requiredDocsRoutes,
    requiredDocsMarkdownRoutes,
    staticWorkerRoutes,
    missingRequiredDocsRoutes: requiredDocsRoutes.filter(route => !hasPrerenderEvidenceRoute(routeSet, route)),
    missingRequiredDocsMarkdownRoutes: requiredDocsMarkdownRoutes.filter(route => !routeSet.has(route)),
    routeCount: routes.length,
    docsPageApiRouteCount: docsPageApiRoutes.length,
    docsMarkdownRouteCount: docsMarkdownRoutes.length,
    docsRouteCount: docsRoutes.length,
  }
}
