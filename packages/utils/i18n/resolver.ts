/**
 * I18n Message Resolver
 *
 * Frontend utility to resolve $i18n:key messages to localized strings.
 * Works with both Vue i18n and standalone usage.
 */

import enMessages from './locales/en.json'
import zhMessages from './locales/zh.json'
import { I18N_PREFIX, isI18nMessage, parseI18nMessage } from './message-keys'

type MessageLocale = 'en' | 'zh'
type Messages = typeof enMessages

const locales: Record<MessageLocale, Messages> = {
  en: enMessages,
  zh: zhMessages,
}

/**
 * Get nested value from object by dot-separated path
 */
function getNestedValue(obj: Record<string, unknown>, path: string): string | undefined {
  const keys = path.split('.')
  let current: unknown = obj

  for (const key of keys) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined
    }
    current = (current as Record<string, unknown>)[key]
  }

  return typeof current === 'string' ? current : undefined
}

/**
 * Interpolate parameters into message
 * @param message Message with placeholders like {name}
 * @param params Parameters to interpolate
 */
function interpolate(message: string, params?: Record<string, unknown>): string {
  if (!params)
    return message

  return message.replace(/\{(\w+)\}/g, (_, key) => {
    return params[key] !== undefined ? String(params[key]) : `{${key}}`
  })
}

/**
 * I18n Message Resolver
 *
 * Resolves $i18n:key format messages to localized strings.
 */
export class I18nResolver {
  private locale: MessageLocale = 'en'
  private customMessages: Partial<Record<MessageLocale, Record<string, unknown>>> = {}

  /**
   * Set current locale
   */
  setLocale(locale: MessageLocale): void {
    this.locale = locale
  }

  /**
   * Get current locale
   */
  getLocale(): MessageLocale {
    return this.locale
  }

  /**
   * Add custom messages for a locale
   */
  addMessages(locale: MessageLocale, messages: Record<string, unknown>): void {
    this.customMessages[locale] = {
      ...this.customMessages[locale],
      ...messages,
    }
  }

  /**
   * Resolve a message string
   *
   * If the string starts with $i18n:, it will be resolved to a localized string.
   * Otherwise, the original string is returned.
   *
   * @param str The message string to resolve
   * @param fallbackLocale Fallback locale if message not found in current locale
   */
  resolve(str: string, fallbackLocale: MessageLocale = 'en'): string {
    if (!isI18nMessage(str)) {
      return str
    }

    const parsed = parseI18nMessage(str)
    if (!parsed) {
      return str
    }

    const { key, params } = parsed

    // Try current locale
    let message = this.getMessage(key, this.locale)

    // Try fallback locale
    if (!message && this.locale !== fallbackLocale) {
      message = this.getMessage(key, fallbackLocale)
    }

    // Return key if no message found
    if (!message) {
      return key
    }

    return interpolate(message, params)
  }

  /**
   * Get message from locale
   */
  private getMessage(key: string, locale: MessageLocale): string | undefined {
    // Try custom messages first
    const customMessage = getNestedValue(
      this.customMessages[locale] as Record<string, unknown> || {},
      key,
    )
    if (customMessage) {
      return customMessage
    }

    // Try built-in messages
    return getNestedValue(locales[locale] as unknown as Record<string, unknown>, key)
  }
}

/**
 * Singleton resolver instance
 */
export const i18nResolver = new I18nResolver()

/**
 * Resolve i18n message shorthand
 *
 * @example
 * resolveI18nMessage('$i18n:devServer.disconnected') // => 'Dev Server Disconnected'
 * resolveI18nMessage('Hello World') // => 'Hello World' (unchanged)
 */
export function resolveI18nMessage(str: string): string {
  return i18nResolver.resolve(str)
}

/**
 * Create i18n message for backend use
 *
 * @example
 * createI18nMessage('devServer.disconnected') // => '$i18n:devServer.disconnected'
 */
export function createI18nMessage(key: string, params?: Record<string, unknown>): string {
  if (params) {
    return `${I18N_PREFIX}${key}|${JSON.stringify(params)}`
  }
  return `${I18N_PREFIX}${key}`
}

/**
 * Vue composable for i18n message resolution
 */
export function useI18nResolver() {
  return {
    resolve: resolveI18nMessage,
    setLocale: (locale: MessageLocale) => i18nResolver.setLocale(locale),
    getLocale: () => i18nResolver.getLocale(),
    addMessages: (locale: MessageLocale, messages: Record<string, unknown>) =>
      i18nResolver.addMessages(locale, messages),
  }
}

export type { MessageLocale, Messages }
