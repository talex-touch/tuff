import { normalizeAuthOrigin, shouldTrustForwardedAuthHost } from '../utils/authOrigin'

export default defineEventHandler((event) => {
  if (import.meta.dev)
    return

  const method = (event.method || '').toUpperCase()
  if (method !== 'GET' && method !== 'HEAD')
    return

  const path = event.path || ''
  if (path.startsWith('/api/') || path.startsWith('/_nuxt/') || path.startsWith('/__nuxt_error'))
    return

  const accept = getHeader(event, 'accept') || ''
  if (accept && !accept.includes('text/html'))
    return

  const configuredOrigin = normalizeAuthOrigin(useRuntimeConfig(event).auth?.origin)
  if (!configuredOrigin || shouldTrustForwardedAuthHost(configuredOrigin))
    return

  const canonicalOrigin = new URL(configuredOrigin)

  const requestUrl = getRequestURL(event)
  if (requestUrl.host.toLowerCase() === canonicalOrigin.host.toLowerCase())
    return

  if (requestUrl.hostname === 'localhost' || requestUrl.hostname === '127.0.0.1')
    return

  const redirectUrl = new URL(`${requestUrl.pathname}${requestUrl.search}${requestUrl.hash}`, canonicalOrigin.origin)
  return sendRedirect(event, redirectUrl.toString(), 307)
})
