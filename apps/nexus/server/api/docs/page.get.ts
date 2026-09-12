import { normalizeDocsPagePath } from '../../utils/docsPath'
import { normalizeDocsPageLocale, resolveDocsPage, shouldIncludeDocsPageBody } from '../../utils/docsPageResolver'

/**
 * Query-string front for the docs page resolver. Production readers reach the prerendered
 * path-shaped JSON first (`server/api/docs/page/[locale]/[mode]/[...path].get.ts`); this
 * route is what serves development, routes outside the prerender list, and the client's
 * fallback when a static read fails. See `server/utils/docsPageResolver.ts`.
 */
export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const docPath = normalizeDocsPagePath(typeof query.path === 'string' ? query.path : '/docs')
  const locale = normalizeDocsPageLocale(query.locale)
  const includeBody = shouldIncludeDocsPageBody(query.body)

  return resolveDocsPage(event, docPath, locale, includeBody)
})
