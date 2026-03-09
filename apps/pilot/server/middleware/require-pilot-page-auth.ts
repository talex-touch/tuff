import { getRequestURL } from 'h3'
import { requirePilotAuth } from '../utils/auth'

const BYPASS_PREFIXES = [
  '/api/',
  '/_nuxt/',
  '/__nuxt_error',
  '/__vite_ping',
  '/auth/login',
  '/auth/authorize',
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

export default defineEventHandler((event) => {
  const requestUrl = getRequestURL(event)
  if (shouldBypass(requestUrl.pathname)) {
    return
  }

  requirePilotAuth(event)
})
