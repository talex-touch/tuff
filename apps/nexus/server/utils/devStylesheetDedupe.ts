const TUFFEX_SOURCE_STYLESHEET_MARKER = '/packages/tuffex/packages/components/'
const STYLESHEET_LINK_RE = /<link\b(?=[^>]*\brel=(["'])stylesheet\1)(?=[^>]*\bhref=(["'])([^"']+)\2)[^>]*>/gi
const LOCALE_PREFIX_RE = /^\/(en|zh)(?=\/|$)/

type DevRouteFamily = 'docs' | 'store' | 'dashboard' | 'landing'

const DOCS_EXCLUDED_STYLESHEET_MARKERS = [
  '/_nuxt/components/TuffFooter.vue?',
  '/_nuxt/components/dashboard/',
  '/_nuxt/components/store/',
  '/_nuxt/components/tuff/',
  '/_nuxt/layouts/store.vue?',
  '/_nuxt/pages/dashboard',
  '/_nuxt/pages/store.vue?',
]

const STORE_EXCLUDED_STYLESHEET_MARKERS = [
  '/_nuxt/components/dashboard/',
  '/_nuxt/components/tuff/TuffHome',
  '/_nuxt/components/tuff/carousel/',
  '/_nuxt/components/tuff/landing/',
  '/_nuxt/components/tuff/VortexBackground.vue?',
  '/_nuxt/pages/dashboard',
]

const DASHBOARD_EXCLUDED_STYLESHEET_MARKERS = [
  '/_nuxt/components/store/',
  '/_nuxt/components/tuff/',
  '/_nuxt/layouts/store.vue?',
  '/_nuxt/pages/store.vue?',
]

const LANDING_EXCLUDED_STYLESHEET_MARKERS = [
  '/_nuxt/components/dashboard/',
  '/_nuxt/components/store/',
  '/_nuxt/layouts/store.vue?',
  '/_nuxt/pages/dashboard',
  '/_nuxt/pages/store.vue?',
]

function normalizeTuffexStylesheetHref(href: string) {
  if (!href.startsWith('/_nuxt/'))
    return null
  if (!href.includes(TUFFEX_SOURCE_STYLESHEET_MARKER))
    return null

  const [path, query = ''] = href.split('?', 2)
  const normalizedPath = path.replace(/^\/_nuxt\/@fs\//, '/_nuxt/')
  return query ? `${normalizedPath}?${query}` : normalizedPath
}

function normalizeRoutePath(path: string | null | undefined) {
  if (!path)
    return '/'

  try {
    return new URL(path, 'http://nexus.local').pathname.replace(LOCALE_PREFIX_RE, '') || '/'
  }
  catch {
    return path.split('?', 1)[0]?.replace(LOCALE_PREFIX_RE, '') || '/'
  }
}

function resolveDevRouteFamily(path: string | null | undefined): DevRouteFamily | null {
  const normalizedPath = normalizeRoutePath(path)

  if (normalizedPath === '/docs' || normalizedPath.startsWith('/docs/'))
    return 'docs'
  if (normalizedPath === '/store' || normalizedPath.startsWith('/store/'))
    return 'store'
  if (normalizedPath === '/dashboard' || normalizedPath.startsWith('/dashboard/'))
    return 'dashboard'
  if (normalizedPath === '/' || normalizedPath === '/new' || normalizedPath.startsWith('/new/') || normalizedPath === '/next' || normalizedPath.startsWith('/next/'))
    return 'landing'

  return null
}

function stylesheetMarkersForRoute(path: string | null | undefined) {
  switch (resolveDevRouteFamily(path)) {
    case 'docs':
      return DOCS_EXCLUDED_STYLESHEET_MARKERS
    case 'store':
      return STORE_EXCLUDED_STYLESHEET_MARKERS
    case 'dashboard':
      return DASHBOARD_EXCLUDED_STYLESHEET_MARKERS
    case 'landing':
      return LANDING_EXCLUDED_STYLESHEET_MARKERS
    default:
      return []
  }
}

function shouldDropRouteLocalStylesheet(href: string, routePath: string | null | undefined) {
  const markers = stylesheetMarkersForRoute(routePath)
  return markers.length > 0 && markers.some(marker => href.includes(marker))
}

export function dedupeDevTuffexStylesheets(html: string, routePath?: string | null) {
  const seen = new Set<string>()

  return html.replace(STYLESHEET_LINK_RE, (link, _relQuote, _hrefQuote, href: string) => {
    if (shouldDropRouteLocalStylesheet(href, routePath))
      return ''

    const key = normalizeTuffexStylesheetHref(href)
    if (!key)
      return link

    if (seen.has(key))
      return ''

    seen.add(key)
    return link
  })
}
