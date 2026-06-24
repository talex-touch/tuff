export const APP_LOCALES = ['zh-CN', 'en-US'] as const
export const SHORT_LOCALES = ['zh', 'en'] as const

export type AppLocale = (typeof APP_LOCALES)[number]
export type ShortLocale = (typeof SHORT_LOCALES)[number]

export const DEFAULT_APP_LOCALE: AppLocale = 'en-US'

export function isAppLocale(value: unknown): value is AppLocale {
  return typeof value === 'string' && (APP_LOCALES as readonly string[]).includes(value)
}

export function isShortLocale(value: unknown): value is ShortLocale {
  return typeof value === 'string' && (SHORT_LOCALES as readonly string[]).includes(value)
}

export function normalizeLocale(input?: string | null): AppLocale | null {
  if (!input) return null

  const normalized = input.trim().replace(/_/g, '-').toLowerCase()
  if (!normalized) return null

  if (normalized === 'zh' || normalized.startsWith('zh-')) return 'zh-CN'
  if (normalized === 'en' || normalized.startsWith('en-')) return 'en-US'

  return null
}

export function toShortLocale(locale: AppLocale): ShortLocale {
  return locale === 'zh-CN' ? 'zh' : 'en'
}

export function toAppLocale(locale: ShortLocale | AppLocale): AppLocale {
  if (isAppLocale(locale)) return locale
  return locale === 'zh' ? 'zh-CN' : 'en-US'
}

export function getFallbackChain(locale: AppLocale): AppLocale[] {
  return locale === DEFAULT_APP_LOCALE
    ? [DEFAULT_APP_LOCALE]
    : [locale, DEFAULT_APP_LOCALE]
}
