/**
 * I18n Helper for Main Process
 * Provides translation support for error messages and notifications in the main process
 */

import { app } from 'electron'
import { type AppLocale, normalizeLocale } from '@talex-touch/utils/i18n'
import enUS from '../../renderer/src/modules/lang/en-US.json'
import zhCN from '../../renderer/src/modules/lang/zh-CN.json'
import { createLogger } from './logger'

type TranslationMessages = Record<string, unknown>
type TranslationKey = string

/**
 * Available locales
 */
export type Locale = AppLocale

/**
 * Translation messages by locale
 */
const messages: Record<Locale, TranslationMessages> = {
  'zh-CN': zhCN,
  'en-US': enUS
}

/**
 * Current locale
 */
let currentLocale: Locale = 'zh-CN'
const i18nLog = createLogger('I18n')

/** Set once a persisted choice has been adopted, so the OS answer cannot override it later. */
let persistedLocaleAdopted = false

/**
 * Initialize i18n with system locale and register IPC handler
 */
export function initI18n(): void {
  const systemLocale = typeof app.getLocale === 'function' ? app.getLocale() : 'zh-CN'
  currentLocale = resolveLocale(systemLocale)
  i18nLog.info(`Initialized with locale: ${currentLocale} (system: ${systemLocale})`)

  /**
   * This runs at import time, before the app is ready, where `app.getLocale()` answers with an
   * empty string - so the log above reads `system: ` and every main-process string falls back to
   * English. Ask the OS again once it can answer; a persisted choice outranks both (see
   * {@link adoptPersistedLocale}).
   */
  if (typeof app?.whenReady === 'function') {
    void app.whenReady().then(() => {
      if (persistedLocaleAdopted) {
        return
      }
      const readyLocale = normalizeLocale(
        typeof app.getLocale === 'function' ? app.getLocale() : ''
      )
      if (readyLocale) {
        setLocale(readyLocale)
      }
    })
  }
}

/**
 * Adopt the language the user picked, read straight from the persisted app settings.
 *
 * `initI18n` cannot know it: it runs before the app is ready, and the renderer only pushes its
 * own locale once its storage lands - seconds into a heavy boot. Every main-process string
 * answered in between (CoreBox destination titles, tray, menu, notifications) rendered English
 * while the app was set to 简体中文. The choice is on disk from the first millisecond instead,
 * and `followSystem` explicitly hands the decision to the OS.
 *
 * @param setting The persisted `APP_SETTING` record (only its `lang` section is read).
 * @returns Whether the setting named a locale to adopt.
 */
export function adoptPersistedLocale(setting: unknown): boolean {
  const lang = (setting as { lang?: { locale?: unknown; followSystem?: unknown } } | null)?.lang
  if (!lang || lang.followSystem === true) {
    return false
  }

  const locale = normalizeLocale(typeof lang.locale === 'string' ? lang.locale : '')
  if (!locale) {
    return false
  }

  // Logged before the switch so the reason reads above `setLocale`'s own line.
  i18nLog.info(`Adopting persisted app language: ${locale}`)
  persistedLocaleAdopted = true
  setLocale(locale)
  return true
}

/**
 * Resolve system locale to supported locale
 */
function resolveLocale(locale: string): Locale {
  return normalizeLocale(locale) ?? 'en-US'
}

/**
 * Surfaces that bake a translation into a native object — the application menu is the one — cannot
 * re-read it later, so they subscribe here and rebuild.
 *
 * Only real changes are announced: `initI18n` resolves the starting locale, and `setLocale` is a
 * no-op for the locale already in use, so a subscriber never sees two events for one language.
 */
const localeChangeListeners = new Set<(locale: Locale) => void>()

/**
 * Subscribe to locale changes. Returns the unsubscribe function.
 */
export function onLocaleChange(listener: (locale: Locale) => void): () => void {
  localeChangeListeners.add(listener)
  return () => {
    localeChangeListeners.delete(listener)
  }
}

/**
 * Set current locale
 */
export function setLocale(locale: Locale): void {
  if (!messages[locale]) {
    i18nLog.warn(`Unsupported locale: ${locale}, keeping current: ${currentLocale}`)
    return
  }
  if (locale === currentLocale) {
    return
  }

  currentLocale = locale
  i18nLog.info(`Locale changed to: ${currentLocale}`)

  for (const listener of localeChangeListeners) {
    try {
      listener(currentLocale)
    } catch (error) {
      // One stale native surface is not worth failing the language switch for: the renderer has
      // already applied the new locale by the time this runs.
      i18nLog.warn('Locale change listener failed', { meta: { error: String(error) } })
    }
  }
}

/**
 * Get current locale
 */
export function getLocale(): Locale {
  return currentLocale
}

/**
 * Get nested value from object by path
 */
function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const keys = path.split('.')
  let value: unknown = obj

  for (const key of keys) {
    if (value && typeof value === 'object' && key in value) {
      value = (value as Record<string, unknown>)[key]
    } else {
      return undefined
    }
  }

  return value
}

/**
 * Translate a key with optional parameters
 * @param key - Translation key (e.g., 'downloadErrors.network_error')
 * @param params - Optional parameters for interpolation
 * @returns Translated string
 */
export function t(key: TranslationKey, params?: Record<string, string | number>): string {
  const message = messages[currentLocale]
  const value = getNestedValue(message, key)

  if (value === undefined) {
    i18nLog.warn('Translation key not found', { meta: { key } })
    return key
  }

  if (typeof value !== 'string') {
    i18nLog.warn('Translation value is not a string', { meta: { key } })
    return key
  }

  // Replace parameters
  if (params) {
    return value.replace(/\{(\w+)\}/g, (match, paramKey) => {
      return params[paramKey] !== undefined ? String(params[paramKey]) : match
    })
  }

  return value
}

/**
 * Format duration in seconds to human-readable string
 */
export function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return t('timeUnits.seconds', { count: seconds })
  }

  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60

  if (minutes < 60) {
    if (remainingSeconds > 0) {
      return `${minutes}${t('timeUnits.minutes')}${remainingSeconds}${t('timeUnits.seconds')}`
    }
    return `${minutes}${t('timeUnits.minutes')}`
  }

  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60

  if (remainingMinutes > 0) {
    return `${hours}${t('timeUnits.hours')}${remainingMinutes}${t('timeUnits.minutes')}`
  }
  return `${hours}${t('timeUnits.hours')}`
}

/**
 * Format file size to human-readable string
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B'

  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const k = 1024
  const i = Math.floor(Math.log(bytes) / Math.log(k))

  return `${(bytes / k ** i).toFixed(1)} ${units[i]}`
}

/**
 * Format relative time
 */
export function formatRelativeTime(date: Date): string {
  const now = new Date()
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000)

  if (diffInSeconds < 60) {
    return t('timeUnits.justNow')
  }

  const diffInMinutes = Math.floor(diffInSeconds / 60)
  if (diffInMinutes < 60) {
    return t('timeUnits.minutesAgo', { count: diffInMinutes })
  }

  const diffInHours = Math.floor(diffInMinutes / 60)
  if (diffInHours < 24) {
    return t('timeUnits.hoursAgo', { count: diffInHours })
  }

  const diffInDays = Math.floor(diffInHours / 24)
  return t('timeUnits.daysAgo', { count: diffInDays })
}

// Initialize on module load
initI18n()
