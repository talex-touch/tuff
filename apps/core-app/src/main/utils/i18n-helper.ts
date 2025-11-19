/**
 * I18n Helper for Main Process
 * Provides translation support for error messages and notifications in the main process
 */

import { app, ipcMain } from 'electron'
import enUS from '../../renderer/src/modules/lang/en-US.json'
import zhCN from '../../renderer/src/modules/lang/zh-CN.json'

type TranslationMessages = typeof zhCN
type TranslationKey = string

/**
 * Available locales
 */
export type Locale = 'zh-CN' | 'en-US'

/**
 * Translation messages by locale
 */
const messages: Record<Locale, TranslationMessages> = {
  'zh-CN': zhCN,
  'en-US': enUS,
}

/**
 * Current locale
 */
let currentLocale: Locale = 'zh-CN'

/**
 * Initialize i18n with system locale and register IPC handler
 */
export function initI18n(): void {
  const systemLocale = app.getLocale()
  currentLocale = resolveLocale(systemLocale)
  console.log(`[I18n] Initialized with locale: ${currentLocale} (system: ${systemLocale})`)

  // Register IPC handler for locale changes from renderer
  ipcMain.on('app:set-locale', (_event, locale: Locale) => {
    console.log(`[I18n] Received locale change request: ${locale}`)
    setLocale(locale)
  })
}

/**
 * Resolve system locale to supported locale
 */
function resolveLocale(locale: string): Locale {
  const normalized = locale.replace('_', '-').toLowerCase()

  if (normalized.startsWith('zh')) {
    return 'zh-CN'
  }

  return 'en-US'
}

/**
 * Set current locale
 */
export function setLocale(locale: Locale): void {
  if (messages[locale]) {
    currentLocale = locale
    console.log(`[I18n] Locale changed to: ${currentLocale}`)
  }
  else {
    console.warn(`[I18n] Unsupported locale: ${locale}, keeping current: ${currentLocale}`)
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
function getNestedValue(obj: any, path: string): any {
  const keys = path.split('.')
  let value = obj

  for (const key of keys) {
    if (value && typeof value === 'object' && key in value) {
      value = value[key]
    }
    else {
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
    console.warn(`[I18n] Translation key not found: ${key}`)
    return key
  }

  if (typeof value !== 'string') {
    console.warn(`[I18n] Translation value is not a string: ${key}`)
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
  if (bytes === 0)
    return '0 B'

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
