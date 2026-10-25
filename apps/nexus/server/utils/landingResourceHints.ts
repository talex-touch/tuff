const IMAGE_PREFETCH_LINK_RE = /<link\b(?=[^>]*\brel=(["'])prefetch\1)(?=[^>]*\bas=(["'])image\2)[^>]*>/gi
const MODULE_PRELOAD_LINK_RE = /<link\b(?=[^>]*\brel=(['"])modulepreload\1)[^>]*>/gi

function normalizeRoutePath(path: string | null | undefined) {
  if (!path)
    return '/'

  try {
    const pathname = new URL(path, 'http://nexus.local').pathname
    return pathname.replace(/\/+$/, '') || '/'
  }
  catch {
    return path.split('?', 1)[0]?.replace(/\/+$/, '') || '/'
  }
}

export function isLandingRoute(path: string | null | undefined) {
  const normalizedPath = normalizeRoutePath(path)
  return normalizedPath === '/' || normalizedPath === '/new' || normalizedPath === '/next'
}

export function isDocsRoute(path: string | null | undefined) {
  const normalizedPath = normalizeRoutePath(path)
  return normalizedPath.startsWith('/docs') || /^\/(?:zh|en)\/docs(?:\/|$)/.test(normalizedPath)
}

const STATIC_PUBLIC_ROUTE_RE = /^\/(?:store|pricing|license|privacy|protocol|updates|login|sign-in|verify-waiting|device-auth)(?:\/|$)/

export function isStaticPublicRoute(path: string | null | undefined) {
  return STATIC_PUBLIC_ROUTE_RE.test(normalizeRoutePath(path))
}

export function isStaticHtmlRoute(path: string | null | undefined) {
  return isLandingRoute(path) || isDocsRoute(path) || isStaticPublicRoute(path)
}

export function stripLandingImagePrefetches(html: string, routePath?: string | null) {
  if (!isLandingRoute(routePath) && !isDocsRoute(routePath))
    return html

  return html.replace(IMAGE_PREFETCH_LINK_RE, '')
}

export function stripStaticModulepreloads(html: string, routePath?: string | null) {
  if (!isStaticHtmlRoute(routePath))
    return html

  return html.replace(MODULE_PRELOAD_LINK_RE, '')
}
