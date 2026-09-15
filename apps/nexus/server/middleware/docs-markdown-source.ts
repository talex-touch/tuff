import { parseDocsMarkdownRoute } from '#shared/utils/docs-markdown'
import { readDocsMarkdownSource } from '../utils/docsMarkdownSource'

/**
 * Serves the Markdown source of a docs page at `/<locale>/docs/<path>.md`.
 *
 * Middleware rather than a route file because the URL ends in a literal suffix after a
 * catch-all segment, which the route matcher cannot express. The pathname test below is a
 * single regex, the same cost as the neighbouring legacy-redirect middleware.
 *
 * Every one of these URLs is prerendered into a static file, so in production Pages answers
 * from disk and this handler never runs. It stays in the Worker only to answer development
 * requests; there the filesystem is present. If it is ever reached in a deployed Worker the
 * source read returns `null` and the answer is a 404, never a guess.
 */
export default defineEventHandler(async (event) => {
  const url = getRequestURL(event)
  const route = parseDocsMarkdownRoute(url.pathname)
  if (!route)
    return

  const source = await readDocsMarkdownSource(route.path, route.locale)
  if (source === null)
    throw createError({ statusCode: 404, statusMessage: 'Not Found' })

  setHeader(event, 'Content-Type', 'text/markdown; charset=utf-8')
  return source
})
