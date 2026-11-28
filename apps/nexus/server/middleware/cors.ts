/**
 * CORS middleware for API routes
 * Enables cross-origin requests for the store API endpoints
 */
function normalizeCorsPath(rawPath: string): string {
  if (!rawPath)
    return ''

  const [rawPathname = ''] = rawPath.split('?')
  let pathname = rawPathname
  try {
    pathname = decodeURIComponent(rawPathname)
  }
  catch {
    // Keep raw pathname when percent-encoding is malformed so control-plane checks stay closed.
  }

  const segments: string[] = []
  for (const segment of pathname.split('/')) {
    if (!segment || segment === '.')
      continue
    if (segment === '..') {
      segments.pop()
      continue
    }
    segments.push(segment)
  }

  return `/${segments.join('/')}`
}

export default defineEventHandler((event) => {
  const path = normalizeCorsPath(event.path || event.node.req.url || '')

  // Only apply CORS to API routes
  if (path !== '/api' && !path.startsWith('/api/')) {
    return
  }

  const isControlPlanePath
    = path === '/api/admin'
      || path.startsWith('/api/admin/')
      || path === '/api/dashboard/intelligence'
      || path.startsWith('/api/dashboard/intelligence/')
  const requestOrigin = getHeader(event, 'origin') || ''
  const allowedOrigin = (useRuntimeConfig(event).auth?.origin as string | undefined) || ''

  if (isControlPlanePath) {
    const headers: Record<string, string> = {
      'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, Accept, X-Login-Token, X-Device-Fingerprint, CF-Access-Client-Id, CF-Access-Client-Secret',
      'Access-Control-Max-Age': '600',
    }
    if (allowedOrigin && requestOrigin === allowedOrigin) {
      headers['Access-Control-Allow-Origin'] = allowedOrigin
      headers.Vary = 'Origin'
    }
    setResponseHeaders(event, headers)

    if (event.method === 'OPTIONS') {
      if (requestOrigin && requestOrigin !== allowedOrigin) {
        event.node.res.statusCode = 403
        event.node.res.statusMessage = 'Forbidden'
        return ''
      }
      event.node.res.statusCode = 204
      event.node.res.statusMessage = 'No Content'
      return ''
    }
    return
  }

  setResponseHeaders(event, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, Accept',
    'Access-Control-Max-Age': '86400',
  })

  // Handle preflight requests
  if (event.method === 'OPTIONS') {
    event.node.res.statusCode = 204
    event.node.res.statusMessage = 'No Content'
    return ''
  }
})
