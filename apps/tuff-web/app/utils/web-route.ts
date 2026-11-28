import { hasDocument, hasNavigator, hasWindow } from '@talex-touch/utils/env'

export type SupportedLocale = 'en' | 'zh'

export const SITE_ORIGIN = 'https://tuff.tagzxia.com'
export const LOCALE_COOKIE_NAME = 'tuff_locale'
export const LOCALE_STORAGE_KEY = 'tuff_locale_preference'
export const LOCALE_MANUAL_STORAGE_KEY = 'tuff_locale_preference_manual'
export const SESSION_HINT_COOKIE_NAME = 'nexus_session_hint'

export const EXTERNAL_APP_PREFIXES = [
  '/tuffex',
  '/sign-in',
  '/login',
  '/verify',
  '/verify-waiting',
  '/device-auth',
  '/dashboard',
  '/admin',
  '/team',
  '/api',
] as const

export function stripTrailingSlash(path: string): string {
  if (!path || path === '/')
    return '/'
  return path.replace(/\/+$/, '') || '/'
}

export function resolveLocaleFromPath(rawPath: string | null | undefined): SupportedLocale {
  const clean = stripTrailingSlash((rawPath || '/').trim())
  const match = clean.match(/^\/(en|zh)(?:\/|$)/i)
  if (match?.[1]?.toLowerCase() === 'zh')
    return 'zh'
  return 'en'
}

export function hasExplicitLocalePrefix(rawPath: string | null | undefined): boolean {
  const clean = stripTrailingSlash((rawPath || '/').trim())
  return /^\/(en|zh)(?:\/|$)/i.test(clean)
}

export function stripLocalePrefix(rawPath: string | null | undefined): string {
  const clean = stripTrailingSlash((rawPath || '/').trim())
  const stripped = clean.replace(/^\/(en|zh)(?=\/|$)/i, '')
  return stripped || '/'
}

/**
 * Builds a localized internal route for `apps/tuff-web`:
 * - `/` -> `/en` or `/zh`
 * - `/pricing` -> `/en/pricing` or `/zh/pricing`
 * - `/docs/guide/start` -> `/en/docs/guide/start` or `/zh/docs/guide/start`
 */
export function toLocalizedWebPath(rawPath: string | null | undefined, locale: SupportedLocale): string {
  const base = stripLocalePrefix(rawPath)
  if (base === '/')
    return `/${locale}`
  return `/${locale}${base.startsWith('/') ? base : `/${base}`}`
}

export function toLocalizedDocsPath(rawPath: string | null | undefined, locale: SupportedLocale): string {
  const stripped = stripLocalePrefix(rawPath)
    .replace(/\.(en|zh)(?:\.(?:mdc|md))?$/i, '')
    .replace(/\.mdc$/i, '')
    .replace(/\/index$/i, '')
  const normalized = stripped === '/' || !stripped
    ? '/docs'
    : stripped.startsWith('/docs')
      ? stripped
      : `/docs${stripped.startsWith('/') ? stripped : `/${stripped}`}`
  return `/${locale}${normalized}`
}

export interface ParsedDocsRoute {
  locale: SupportedLocale
  slug: string
  canonicalPath: string
  section: 'root' | 'guide' | 'dev'
}

export function parseDocsRoute(rawPath: string): ParsedDocsRoute {
  const locale = resolveLocaleFromPath(rawPath)
  const stripped = stripLocalePrefix(rawPath)
    .replace(/\.(en|zh)(?:\.(?:mdc|md))?$/i, '')
    .replace(/\.mdc$/i, '')
    .replace(/\/index$/i, '')

  let slug = ''
  if (stripped.startsWith('/docs/'))
    slug = stripped.slice('/docs/'.length).replace(/^\/+|\/+$/g, '')
  else if (stripped !== '/docs' && stripped !== '/')
    slug = stripped.replace(/^\/+|\/+$/g, '')

  const canonicalPath = slug ? `/docs/${slug}` : '/docs'
  const section = slug === 'guide' || slug.startsWith('guide/')
    ? 'guide'
    : slug === 'dev' || slug.startsWith('dev/')
      ? 'dev'
      : 'root'

  return {
    locale,
    slug,
    canonicalPath,
    section,
  }
}

export function isExternalAppPath(rawPath: string | null | undefined): boolean {
  if (!rawPath)
    return false
  const clean = stripTrailingSlash(rawPath.split(/[?#]/, 1)[0] || '/')
  return EXTERNAL_APP_PREFIXES.some(prefix => clean === prefix || clean.startsWith(`${prefix}/`))
}

export function buildCanonicalWebUrl(rawPath: string, origin = SITE_ORIGIN): string {
  const cleanOrigin = origin.replace(/\/+$/, '')
  const cleanRoute = stripTrailingSlash((rawPath || '/').split(/[?#]/, 1)[0] || '/')
  return cleanRoute === '/' ? `${cleanOrigin}/` : `${cleanOrigin}${cleanRoute}`
}

export function readStoredLocalePreference(): SupportedLocale | null {
  if (!import.meta.client)
    return null

  if (hasDocument()) {
    try {
      const cookieMatch = document.cookie.match(/(?:^|;\s*)tuff_locale=(en|zh)(?:;|$)/i)
      if (cookieMatch?.[1])
        return cookieMatch[1].toLowerCase() as SupportedLocale
    }
    catch {
      // ignore cookie error
    }
  }

  if (hasWindow()) {
    try {
      const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY)?.trim().toLowerCase()
      if (stored === 'zh' || stored === 'en')
        return stored
    }
    catch {
      // ignore storage error
    }
  }

  return null
}

export function persistLocalePreference(locale: SupportedLocale, manual = true): void {
  if (!import.meta.client)
    return

  if (hasDocument()) {
    try {
      document.cookie = `${LOCALE_COOKIE_NAME}=${locale}; path=/; max-age=31536000; samesite=lax`
    }
    catch {
      // ignore cookie write error
    }
  }

  if (hasWindow()) {
    try {
      window.localStorage.setItem(LOCALE_STORAGE_KEY, locale)
      if (manual)
        window.localStorage.setItem(LOCALE_MANUAL_STORAGE_KEY, '1')
    }
    catch {
      // ignore storage write error
    }
  }
}

export function detectBrowserPreferredLocale(): SupportedLocale {
  const stored = readStoredLocalePreference()
  if (stored)
    return stored

  if (import.meta.client && hasNavigator()) {
    const lang = (navigator.languages?.[0] || navigator.language || '').toLowerCase()
    if (lang.startsWith('zh'))
      return 'zh'
  }
  return 'en'
}

export function hasSessionHintCookie(): boolean {
  if (!import.meta.client || !hasDocument())
    return false
  try {
    return /(?:^|;\s*)nexus_session_hint=1(?:;|$)/.test(document.cookie)
  }
  catch {
    return false
  }
}

export function sanitizeRedirectPath(rawPath: string | null | undefined, fallback = '/dashboard'): string {
  if (!rawPath || typeof rawPath !== 'string')
    return fallback
  const trimmed = rawPath.trim()
  if (!trimmed.startsWith('/') || trimmed.startsWith('//'))
    return fallback
  return trimmed
}

/**
 * Tiny synchronous pre-paint inline `<script>` for unprefixed root pages (`/`, `/pricing`,
 * `/updates`, `/store`, `/license`, `/privacy`, `/protocol`) that redirects Chinese visitors
 * directly to the prerendered `/zh...` static HTML BEFORE first paint — ZERO Flash-of-English!
 * Crawlers and English visitors stay on the HTTP 200 SSR page with zero redirect.
 */
export const ROOT_LOCALE_AUTO_REDIRECT_SCRIPT = `(function(){try{var p=location.pathname||'/';if(/^\\/(en|zh)(\\/|$)/i.test(p))return;var t=null;var m=document.cookie.match(/(?:^|;\\s*)tuff_locale=(zh|en)(?:;|$)/i);if(m){t=m[1].toLowerCase();}else{var s=localStorage.getItem('tuff_locale_preference');if(s==='zh'||s==='en'){t=s;}else if(navigator.language&&/^zh/i.test(navigator.language)){t='zh';}}if(t==='zh'){location.replace('/zh'+(p==='/'?'':p)+location.search+location.hash);}}catch(_){}})();`
