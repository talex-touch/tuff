import { isDocsLocale, normalizeDocsPagePath } from '../../../../../utils/docsPath'
import { resolveDocsPage } from '../../../../../utils/docsPageResolver'
import { DOCS_PAGE_JSON_MODES, parseStaticDocsPageJsonParams } from '#shared/utils/docs-page-json'

/**
 * Path-shaped front for the docs page resolver: `/api/docs/page/<locale>/<mode>/<path>.json`.
 *
 * It exists so the build can prerender every document into a static file. The query-string
 * front (`/api/docs/page?path=…`) cannot: query strings never materialise as distinct files on
 * Cloudflare Pages, which is why `af99441e0` was reverted. A path with a `.json` suffix does, and
 * `_routes.json` then keeps it off the Worker, so client-side navigation between docs pages stops
 * paying a Worker round trip (1–2 s from CN) for a body that only changes on deploy.
 *
 * Anything this route cannot parse is a 404 rather than a guess: a wrong locale or mode would
 * otherwise be cached under the wrong key and served to every later reader.
 */
export default defineEventHandler(async (event) => {
  const params = parseStaticDocsPageJsonParams(event.context.params)
  if (!params) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Not Found',
      message: `Expected /api/docs/page/<${['en', 'zh'].join('|')}>/<${DOCS_PAGE_JSON_MODES.join('|')}>/<path>.json`,
    })
  }

  if (!isDocsLocale(params.locale))
    throw createError({ statusCode: 404, statusMessage: 'Not Found' })

  return resolveDocsPage(event, normalizeDocsPagePath(params.path), params.locale, params.mode === 'body')
})
