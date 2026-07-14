import { useCookie } from '#imports'

type SupportedLocale = 'en' | 'zh'

const LOCALE_STORAGE_KEY = 'tuff_locale_preference'
const LOCALE_MANUAL_STORAGE_KEY = 'tuff_locale_preference_manual'
const LOCALE_COOKIE_NAME = 'tuff_locale'

const isSupportedLocale = (value?: string | null): value is SupportedLocale => value === 'en' || value === 'zh'

export function useLocalePreference() {
  const cookie = useCookie<SupportedLocale | null>(LOCALE_COOKIE_NAME, {
    path: '/',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 365,
  })

  const readFromStorage = (): SupportedLocale | null => {
    if (import.meta.client) {
      const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY)
      if (isSupportedLocale(stored))
        return stored
    }
    return null
  }

  const getPreferredLocale = (): SupportedLocale | null => {
    const stored = readFromStorage()
    if (stored)
      return stored
    if (isSupportedLocale(cookie.value))
      return cookie.value
    return null
  }

  const hasManualPreferredLocale = () => {
    if (!import.meta.client)
      return false

    const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY)
    if (!isSupportedLocale(stored))
      return false

    const marker = window.localStorage.getItem(LOCALE_MANUAL_STORAGE_KEY)
    return marker === '1' || marker === null
  }

  const markManualPreferredLocale = () => {
    if (import.meta.client)
      window.localStorage.setItem(LOCALE_MANUAL_STORAGE_KEY, '1')
  }

  const markProfilePreferredLocale = () => {
    if (import.meta.client && window.localStorage.getItem(LOCALE_MANUAL_STORAGE_KEY) !== '1')
      window.localStorage.setItem(LOCALE_MANUAL_STORAGE_KEY, 'profile')
  }

  const clearLegacyScopedCookies = () => {
    if (!import.meta.client)
      return

    const currentPath = window.location.pathname || '/'
    const pathSegments = currentPath.split('/').filter(Boolean)
    const currentPathScopes = pathSegments.map((_, index) => `/${pathSegments.slice(0, index + 1).join('/')}`)
    const knownPathScopes = [
      '/',
      '/auth',
      '/dashboard',
      '/device-auth',
      '/docs',
      '/forgot-password',
      '/license',
      '/pricing',
      '/privacy',
      '/protocol',
      '/sign-in',
      '/store',
      '/updates',
      '/verify-waiting',
    ]

    for (const path of new Set([...knownPathScopes, ...currentPathScopes]))
      document.cookie = `${LOCALE_COOKIE_NAME}=; Max-Age=0; Path=${path}; SameSite=Lax`
  }

  const persistPreferredLocale = (nextLocale: SupportedLocale) => {
    clearLegacyScopedCookies()
    cookie.value = nextLocale
    if (import.meta.client)
      window.localStorage.setItem(LOCALE_STORAGE_KEY, nextLocale)
  }

  return {
    getPreferredLocale,
    hasManualPreferredLocale,
    markManualPreferredLocale,
    markProfilePreferredLocale,
    persistPreferredLocale,
  }
}
