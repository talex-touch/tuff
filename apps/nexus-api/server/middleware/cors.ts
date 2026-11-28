import { defineEventHandler, getHeader, setResponseHeaders } from 'h3'
import { useRuntimeConfig } from 'nitropack/runtime'
import { readCloudflareBindings } from '../utils/cloudflare'

/**
 * CORS middleware for API routes.
 * Control-plane routes (`/api/admin/*`) enforce exact origin matching with credentials;
 * public API routes allow cross-origin consumption.
 */
export default defineEventHandler((event) => {
  const path = event.path || ''
  if (!path.startsWith('/api/'))
    return

  const isAdminPath = path.startsWith('/api/admin/')
  const requestOrigin = getHeader(event, 'origin') || ''
  const bindings = readCloudflareBindings(event)
  const config = useRuntimeConfig(event) as { auth?: { origin?: string } }
  const allowedOrigin = (bindings?.AUTH_ORIGIN || config.auth?.origin || '').trim()

  if (isAdminPath) {
    const headers: Record<string, string> = {
      'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, Accept, X-Login-Token, X-Device-Id, CF-Access-Client-Id, CF-Access-Client-Secret',
      'Access-Control-Max-Age': '600',
    }
    if (allowedOrigin && requestOrigin === allowedOrigin) {
      headers['Access-Control-Allow-Origin'] = allowedOrigin
      headers['Access-Control-Allow-Credentials'] = 'true'
      headers.Vary = 'Origin'
    }
    setResponseHeaders(event, headers)

    if (event.method === 'OPTIONS') {
      if (requestOrigin && allowedOrigin && requestOrigin !== allowedOrigin) {
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

  const headers: Record<string, string> = {
    'Access-Control-Allow-Origin': requestOrigin && allowedOrigin && requestOrigin === allowedOrigin ? allowedOrigin : '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, Accept, X-Device-Id, X-Device-Name, X-Device-Platform, X-Login-Token, X-Idempotency-Key',
    'Access-Control-Max-Age': '86400',
  }
  if (requestOrigin && allowedOrigin && requestOrigin === allowedOrigin) {
    headers['Access-Control-Allow-Credentials'] = 'true'
    headers.Vary = 'Origin'
  }
  setResponseHeaders(event, headers)

  if (event.method === 'OPTIONS') {
    event.node.res.statusCode = 204
    event.node.res.statusMessage = 'No Content'
    return ''
  }
})
