/**
 * Keeps the deployed Worker off the runtime content database.
 *
 * Nuxt Content answers queries from a copy of the content in the production D1, checked against the
 * build on each isolate's first query and rebuilt inline when it differs — up to 671 statements one
 * after another for the docs collection (100–170 s), with other isolates waiting up to 90 s on it,
 * and stuck for good if the rebuilding request is cancelled. The site needs none of it: docs and
 * policy pages are prerendered, and their clients read the static JSON twins. Outside development
 * and prerendering, ANY request matching these prefixes that escapes `_routes.json` onto the Worker
 * fails fast with 404/410 and ZERO D1 `queryCollection` rebuild.
 */
const BLOCKED_CONTENT_PREFIXES = [
  '/__nuxt_content',
  '/api/docs/page',
  '/api/docs/navigation',
  '/api/docs/search',
  '/llms.txt',
] as const

const EVICTED_CONTENT_PREFIXES = [
  '/api/docs/sidebar-components',
  '/api/docs/component-sync',
] as const

function matchesRoutePrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`)
}

export default defineEventHandler((event) => {
  if (import.meta.dev || import.meta.prerender)
    return

  const pathname = getRequestURL(event).pathname
  if (EVICTED_CONTENT_PREFIXES.some(prefix => matchesRoutePrefix(pathname, prefix)))
    throw createError({ statusCode: 410, statusMessage: 'Gone' })

  if (BLOCKED_CONTENT_PREFIXES.some(prefix => matchesRoutePrefix(pathname, prefix)))
    throw createError({ statusCode: 404, statusMessage: 'Not Found' })

  // Clients built before the policy documents were prerendered still ask the query form.
  if (pathname === '/api/content/policy') {
    const query = getQuery(event)
    const name = typeof query.name === 'string' ? query.name.trim().toLowerCase() : ''
    if (!/^[a-z0-9-]{1,80}$/.test(name))
      throw createError({ statusCode: 400, statusMessage: 'Invalid policy name.' })
    const locale = typeof query.locale === 'string' && query.locale.trim().toLowerCase() === 'zh' ? 'zh' : 'en'
    return sendRedirect(event, `/api/content/policy/${name}/${locale}`, 307)
  }
})
