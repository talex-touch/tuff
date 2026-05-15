import { createDocsPrerenderRoutes } from './docs-prerender-routes'

export const publicPrerenderRoutes = [
  '/',
  '/next',
  '/docs',
  '/pricing',
  '/license',
  '/privacy',
  '/protocol',
] as const

export const docsApiPrerenderRoutes = [
  '/api/docs/component-sync',
  '/api/docs/navigation',
  '/api/docs/sidebar-components',
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
