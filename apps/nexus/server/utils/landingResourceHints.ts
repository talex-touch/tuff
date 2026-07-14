const IMAGE_PREFETCH_LINK_RE = /<link\b(?=[^>]*\brel=(["'])prefetch\1)(?=[^>]*\bas=(["'])image\2)[^>]*>/gi

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

function isLandingRoute(path: string | null | undefined) {
  const normalizedPath = normalizeRoutePath(path)
  return normalizedPath === '/' || normalizedPath === '/new' || normalizedPath === '/next'
}

export function stripLandingImagePrefetches(html: string, routePath?: string | null) {
  if (!isLandingRoute(routePath))
    return html

  return html.replace(IMAGE_PREFETCH_LINK_RE, '')
}
