import { toLocalizedDocsPath } from '#shared/utils/docs-path'

export default defineEventHandler((event) => {
  const url = getRequestURL(event)
  if (!/^\/docs(?=\/|$)/.test(url.pathname))
    return

  const target = `${toLocalizedDocsPath(url.pathname, 'en')}${url.search}`
  if (target === `${url.pathname}${url.search}`)
    return

  return sendRedirect(event, target, 308)
})
