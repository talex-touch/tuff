type SupportedLocale = 'en' | 'zh'

const LOCALE_STORAGE_KEY = 'tuff_locale_preference'
const LOCALE_COOKIE_NAME = 'tuff_locale'

const isSupportedLocale = (value?: string | null): value is SupportedLocale => value === 'en' || value === 'zh'

export function useLocalePreference() {
  const cookie = useCookie<SupportedLocale | null>(LOCALE_COOKIE_NAME, {
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
    if (isSupportedLocale(cookie.value))
      return cookie.value
    return readFromStorage()
  }

  const persistPreferredLocale = (nextLocale: SupportedLocale) => {
    cookie.value = nextLocale
    if (import.meta.client)
      window.localStorage.setItem(LOCALE_STORAGE_KEY, nextLocale)
  }

  return {
    getPreferredLocale,
    persistPreferredLocale,
  }
}
