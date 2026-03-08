import { getRequestURL, sendRedirect } from 'h3'
import { requirePilotAuth } from '../utils/auth'

const BYPASS_PREFIXES = [
  '/api/',
  '/_nuxt/',
  '/__nuxt_error',
  '/__vite_ping',
  '/auth/login',
  '/auth/callback',
  '/favicon',
  '/robots.txt',
  '/sitemap.xml',
]

function shouldBypass(pathname: string): boolean {
  if (pathname === '/api' || pathname === '/_nuxt') {
    return true
  }
  return BYPASS_PREFIXES.some(prefix => pathname.startsWith(prefix))
}

function sanitizeReturnTo(pathname: string, search: string): string {
  const merged = `${pathname}${search || ''}`
  if (!merged.startsWith('/') || merged.startsWith('//')) {
    return '/'
  }
  return merged
}

export default defineEventHandler((event) => {
  const requestUrl = getRequestURL(event)
  if (shouldBypass(requestUrl.pathname)) {
    return
  }

  try {
    requirePilotAuth(event)
  }
  catch (error) {
    const statusCode = (error as { statusCode?: number } | null)?.statusCode
    if (statusCode === 401) {
      const loginUrl = new URL('/auth/login', requestUrl.origin)
      loginUrl.searchParams.set('returnTo', sanitizeReturnTo(requestUrl.pathname, requestUrl.search))
      return sendRedirect(event, loginUrl.toString(), 302)
    }
    throw error
  }
})
