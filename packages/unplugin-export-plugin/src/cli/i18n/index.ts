import en from './locales/en'
import zh from './locales/zh'

export type Locale = 'en' | 'zh'
export type LocaleMessages = typeof en

const locales: Record<Locale, LocaleMessages> = { en, zh }

let currentLocale: Locale = 'en'

/**
 * Detect system language and return matching locale
 */
export function detectSystemLocale(): Locale {
  const env = process.env
  const langEnv = env.LANG || env.LANGUAGE || env.LC_ALL || env.LC_MESSAGES || ''
  
  if (langEnv.toLowerCase().startsWith('zh')) {
    return 'zh'
  }
  
  // Also check for Chinese locale on different platforms
  if (process.platform === 'darwin') {
    // macOS: check AppleLocale
    const appleLocale = env.AppleLocale || ''
    if (appleLocale.toLowerCase().startsWith('zh')) {
      return 'zh'
    }
  }
  
  return 'en'
}

/**
 * Initialize i18n with system locale
 */
export function initI18n(): Locale {
  currentLocale = detectSystemLocale()
  return currentLocale
}

/**
 * Get current locale
 */
export function getLocale(): Locale {
  return currentLocale
}

/**
 * Set current locale
 */
export function setLocale(locale: Locale): void {
  if (locales[locale]) {
    currentLocale = locale
  }
}

/**
 * Get nested value from object by dot path
 */
function getNestedValue(obj: any, path: string): string | undefined {
  const keys = path.split('.')
  let value = obj
  for (const key of keys) {
    if (value && typeof value === 'object' && key in value) {
      value = value[key]
    } else {
      return undefined
    }
  }
  return typeof value === 'string' ? value : undefined
}

/**
 * Translate a key with optional interpolation
 */
export function t(key: string, params?: Record<string, string | number>): string {
  const messages = locales[currentLocale]
  let text = getNestedValue(messages, key)
  
  if (!text) {
    // Fallback to English
    text = getNestedValue(locales.en, key)
  }
  
  if (!text) {
    return key
  }
  
  // Interpolate params
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v))
    }
  }
  
  return text
}

/**
 * Get all available locales
 */
export function getAvailableLocales(): Locale[] {
  return Object.keys(locales) as Locale[]
}

export { en, zh }
