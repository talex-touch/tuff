/**
 * CORS middleware for API routes
 * Enables cross-origin requests for the store API endpoints
 */
function normalizeCorsPath(rawPath: string): { path: string, malformed: boolean } {
  if (!rawPath)
    return { path: '', malformed: false }

  const [rawPathname = ''] = rawPath.split('?')
  let malformed = false
  const segments: string[] = []
  for (const rawSegment of rawPathname.split('/')) {
    if (!rawSegment)
      continue
    let decoded = rawSegment
    try {
      decoded = decodeURIComponent(rawSegment)
    }
    catch {
      malformed = true
      decoded = rawSegment.replace(/%[0-9a-fA-F]{2}/g, (match) => {
        try {
          return decodeURIComponent(match)
        }
        catch {
          return match
        }
      })
    }
    for (const part of decoded.split('/')) {
      if (!part || part === '.')
        continue
      if (part === '..') {
        segments.pop()
        continue
      }
      segments.push(part)
    }
  }

  return { path: `/${segments.join('/')}`, malformed }
}

export default defineEventHandler((event) => {
  const { path, malformed } = normalizeCorsPath(event.path || event.node.req.url || '')

  // Only apply CORS to API routes
  if (path !== '/api' && !path.startsWith('/api/')) {
    return
  }

  const isControlPlanePath
    = malformed
      || path === '/api/admin'
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
