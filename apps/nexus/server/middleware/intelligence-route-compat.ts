import { createError } from 'h3'

const LEGACY_PROVIDER_ACTION_RE = /^\/api\/dashboard\/intelligence\/providers\/([^/]+)\.(probe|test)\/?$/

export default defineEventHandler((event) => {
  const reqUrl = event.node.req.url || ''
  if (!reqUrl.startsWith('/api/dashboard/intelligence/providers/'))
    return

  const [pathname, queryString] = reqUrl.split('?')
  const matched = pathname.match(LEGACY_PROVIDER_ACTION_RE)
  if (!matched)
    return

  const providerId = matched[1]
  const action = matched[2]
  if (!providerId || !action)
    return

  const endpoint = `/api/dashboard/intelligence/providers/${providerId}.${action}${queryString ? `?${queryString}` : ''}`
  throw createError({
    statusCode: 410,
    statusMessage: `Deprecated endpoint "${endpoint}". Use "/api/dashboard/intelligence/providers/${providerId}/${action}" instead.`,
  })
})
