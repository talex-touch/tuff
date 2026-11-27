export type SupportedLocale = 'en' | 'zh'

export const TUFFEX_BASE_PATH = '/tuffex'
export const SITE_ORIGIN = 'https://tuff.tagzxia.com'
export const LOCALE_COOKIE_NAME = 'tuff_locale'
export const LOCALE_STORAGE_KEY = 'tuff_locale_preference'
export const LOCALE_MANUAL_STORAGE_KEY = 'tuff_locale_preference_manual'

export type TuffexRouteKind = 'index' | 'component' | 'concepts-index' | 'concept' | 'composition'

export interface ParsedTuffexRoute {
  locale: SupportedLocale
  slug: string
  canonicalPath: string
  kind: TuffexRouteKind
}

const NON_COMPONENT_SLUGS = new Set([
  '',
  'index',
  'concepts',
  'composition',
  'installation',
  'foundations',
  'theming',
  'icons',
  'accessibility',
  'utils',
  'sound',
  'changelog',
  'base-suite',
  'pro-suite',
  'ai-suite',
  'data-suite',
  'flow-suite',
  'motion-suite',
  '__not-found',
])

export function stripTrailingSlash(path: string): string {
  if (!path || path === '/')
    return '/'
  return path.replace(/\/+$/, '') || '/'
}

/**
 * Strips any leading `/tuffex` base prefix cleanly, guarding against duplicate
 * `/tuffex/tuffex/` prefixes when building canonical URLs or internal router paths.
 */
export function stripTuffexBase(rawPath: string): string {
  let path = (rawPath || '/').trim()
  if (!path.startsWith('/'))
    path = `/${path}`
  while (path === '/tuffex' || path.startsWith('/tuffex/')) {
    path = path.slice('/tuffex'.length) || '/'
  }
  return stripTrailingSlash(path)
}

export function resolveLocaleFromPath(rawPath: string): SupportedLocale {
  const clean = stripTuffexBase(rawPath)
  const match = clean.match(/^\/(en|zh)(?:\/|$)/i)
  if (match?.[1]?.toLowerCase() === 'zh')
    return 'zh'
  return 'en'
}

/**
 * Normalizes legacy Nexus docs paths (`/docs/dev/components/...`,
 * `/docs/dev/concepts/...`, `/docs/dev/getting-started/tuffex-composition`)
 * as well as native TuffEx paths (`/{en,zh}/...`, `/concepts/...`, `/<slug>`)
 * into a locale-agnostic canonical TuffEx path (`/` | `/<slug>` | `/concepts` |
 * `/concepts/<slug>` | `/composition`).
 */
export function normalizeTuffexDocPath(rawPath: string | null | undefined): string {
  if (!rawPath)
    return '/'

  let path = stripTuffexBase(rawPath)
  // Strip locale prefix if present
  path = path.replace(/^\/(en|zh)(?=\/|$)/i, '') || '/'
  // Strip `.en.mdc`, `.zh.mdc`, `.en`, `.zh` suffixes
  path = path.replace(/\.(en|zh)(?:\.mdc)?$/i, '').replace(/\.mdc$/i, '')

  // Rewrite legacy Nexus content paths
  if (path === '/docs/dev/components' || path === '/docs/dev/components/index')
    return '/'
  if (path.startsWith('/docs/dev/components/'))
    path = `/${path.slice('/docs/dev/components/'.length)}`
  else if (path === '/docs/dev/concepts' || path === '/docs/dev/concepts/index')
    return '/concepts'
  else if (path.startsWith('/docs/dev/concepts/'))
    path = `/concepts/${path.slice('/docs/dev/concepts/'.length)}`
  else if (path === '/docs/dev/getting-started/tuffex-composition')
    return '/composition'
  else if (path === '/components' || path === '/components/index')
    return '/'
  else if (path.startsWith('/components/'))
    path = `/${path.slice('/components/'.length)}`

  path = stripTrailingSlash(path)
  if (path === '/index')
    return '/'
  if (path === '/concepts/index')
    return '/concepts'
  return path || '/'
}

export function parseTuffexRoute(rawPath: string): ParsedTuffexRoute {
  const locale = resolveLocaleFromPath(rawPath)
  const canonicalPath = normalizeTuffexDocPath(rawPath)

  if (canonicalPath === '/') {
    return { locale, slug: '', canonicalPath: '/', kind: 'index' }
  }
  if (canonicalPath === '/composition') {
    return { locale, slug: 'composition', canonicalPath: '/composition', kind: 'composition' }
  }
  if (canonicalPath === '/concepts') {
    return { locale, slug: 'concepts', canonicalPath: '/concepts', kind: 'concepts-index' }
  }
  if (canonicalPath.startsWith('/concepts/')) {
    const slug = canonicalPath.slice(1)
    return { locale, slug, canonicalPath, kind: 'concept' }
  }

  const slug = canonicalPath.replace(/^\/+/, '')
  return { locale, slug, canonicalPath, kind: 'component' }
}

/**
 * Returns the internal Vue Router path (WITHOUT `/tuffex` baseURL since Nuxt
 * prepends `app.baseURL = '/tuffex/'` automatically on internal `<NuxtLink>`).
 */
export function toLocalizedTuffexPath(rawPath: string | null | undefined, locale: SupportedLocale): string {
  const canonical = normalizeTuffexDocPath(rawPath)
  if (canonical === '/')
    return `/${locale}`
  return `/${locale}${canonical}`
}

/**
 * Returns true if a path belongs to the TuffEx docs app (either native or a
 * legacy `/docs/dev/components|concepts|tuffex-composition` link).
 */
export function isTuffexInternalDocPath(rawPath: string): boolean {
  if (!rawPath || /^(?:https?:|mailto:|tel:|#)/i.test(rawPath))
    return false
  const noBase = stripTuffexBase(rawPath)
  if (rawPath.startsWith('/tuffex/') || rawPath === '/tuffex')
    return true
  const withoutLocale = noBase.replace(/^\/(en|zh)(?=\/|$)/i, '') || '/'
  if (
    withoutLocale === '/docs/dev/components'
    || withoutLocale.startsWith('/docs/dev/components/')
    || withoutLocale === '/docs/dev/concepts'
    || withoutLocale.startsWith('/docs/dev/concepts/')
    || withoutLocale === '/docs/dev/getting-started/tuffex-composition'
  ) {
    return true
  }
  // Cross-app Nexus paths start with /docs, /store, /updates, /pricing, /dashboard, /sign-in
  if (/^\/(?:docs|store|updates|pricing|dashboard|sign-in|admin|blog|privacy|license)(?:\/|$)/i.test(withoutLocale))
    return false
  if (noBase === '/')
    return false
  return /^\/(en|zh)(?:\/|$)/i.test(noBase)
}

/**
 * Resolves a component slug for framework matrix/status bar lookup.
 * Returns `null` for overview/suite/concept/template/guide pages.
 */
export function resolveTuffexComponentSlug(rawPath: string | null | undefined): string | null {
  if (!rawPath)
    return null
  const canonical = normalizeTuffexDocPath(rawPath)
  if (canonical === '/' || canonical.startsWith('/concepts') || canonical === '/composition')
    return null
  const slug = canonical.replace(/^\/+/, '').split('/')[0]?.trim().toLowerCase() ?? ''
  if (!slug || NON_COMPONENT_SLUGS.has(slug) || slug.startsWith('template-'))
    return null
  return slug
}

/**
 * Builds the canonical production URL under `https://tuff.tagzxia.com/tuffex...`
 * with zero trailing slash and zero duplicate `/tuffex/tuffex/`.
 */
export function buildCanonicalTuffexUrl(rawPath: string, origin = SITE_ORIGIN): string {
  const cleanOrigin = origin.replace(/\/+$/, '')
  const cleanRoute = stripTuffexBase(rawPath)
  if (cleanRoute === '/')
    return `${cleanOrigin}${TUFFEX_BASE_PATH}`
  return `${cleanOrigin}${TUFFEX_BASE_PATH}${cleanRoute}`
}

/**
 * Reads the shared same-origin locale preference (`tuff_locale` cookie first,
 * then `localStorage.tuff_locale_preference`).
 */
export function readStoredLocalePreference(): SupportedLocale | null {
  if (!import.meta.client)
    return null

  try {
    const cookieMatch = document.cookie.match(/(?:^|;\s*)tuff_locale=(en|zh)(?:;|$)/i)
    if (cookieMatch?.[1])
      return cookieMatch[1].toLowerCase() as SupportedLocale
  }
  catch {
    // ignore cookie access error
  }

  try {
    const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY)?.trim().toLowerCase()
    if (stored === 'zh' || stored === 'en')
      return stored
  }
  catch {
    // ignore storage access error
  }

  return null
}

/**
 * Persists the shared locale preference across TuffEx Docs and Nexus on the
 * same origin (`tuff_locale` cookie + localStorage keys).
 */
export function persistLocalePreference(locale: SupportedLocale, manual = true): void {
  if (!import.meta.client)
    return

  try {
    document.cookie = `${LOCALE_COOKIE_NAME}=${locale}; path=/; max-age=31536000; samesite=lax`
  }
  catch {
    // ignore cookie write error
  }

  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale)
    if (manual)
      window.localStorage.setItem(LOCALE_MANUAL_STORAGE_KEY, '1')
  }
  catch {
    // ignore storage write error
  }
}

export function detectBrowserPreferredLocale(): SupportedLocale {
  const stored = readStoredLocalePreference()
  if (stored)
    return stored

  if (import.meta.client && typeof navigator !== 'undefined') {
    const lang = (navigator.languages?.[0] || navigator.language || '').toLowerCase()
    if (lang.startsWith('zh'))
      return 'zh'
  }
  return 'en'
}
