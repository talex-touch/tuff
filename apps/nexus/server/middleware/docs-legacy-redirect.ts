import { toLocalizedDocsPath } from '#shared/utils/docs-path'
import { isDocsMarkdownRequestPath, toDocsMarkdownPath } from '#shared/utils/docs-markdown'

export default defineEventHandler((event) => {
  const url = getRequestURL(event)
  if (!/^\/docs(?=\/|$)/.test(url.pathname))
    return

  // A raw-source request keeps its `.md`: `normalizeDocsPagePath` treats the suffix as a
  // content extension and would strip it, redirecting the agent to the rendered page instead.
  const localized = isDocsMarkdownRequestPath(url.pathname)
    ? toDocsMarkdownPath(url.pathname, 'en')
    : toLocalizedDocsPath(url.pathname, 'en')

  const target = `${localized}${url.search}`
  if (target === `${url.pathname}${url.search}`)
    return

  return sendRedirect(event, target, 308)
})
