import { createDocsPrerenderRoutes } from './docs-prerender-routes'

export const publicPrerenderRoutes = [
  '/',
  '/next',
  '/docs',
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

export function createNexusPrerenderRoutes(nexusRoot: string) {
  return [
    ...new Set([
      ...publicPrerenderRoutes,
      ...docsApiPrerenderRoutes,
      ...createDocsPrerenderRoutes(nexusRoot),
    ]),
  ]
}
