import { nextTick } from 'vue'
import type { I18n } from 'vue-i18n'
import { createI18n } from 'vue-i18n'
import enUS from './en-US.json'
import zhCN from './zh-CN.json'

type MessageMap = Record<string, unknown>
type LocaleKey = string
export type I18nInstance = I18n<MessageMap, MessageMap, MessageMap, LocaleKey, false>

/**
 * Setup i18n instance with provided options
 * @param options - i18n options with default locale
 * @returns i18n instance
 */
export async function setupI18n(
  options: { locale: string } = { locale: 'en-US' }
): Promise<I18nInstance> {
  const i18n = createI18n({
    legacy: false,
    locale: options.locale,
    messages: {}
  }) as I18nInstance

  await loadLocaleMessages(i18n, options.locale)

  setI18nLanguage(i18n, options.locale)
  return i18n
}

/**
 * Set the language for the i18n instance and HTML document
 * @param i18n - i18n instance
 * @param locale - locale string
 */
export function setI18nLanguage(i18n: I18nInstance, locale: string): void {
  i18n.global.locale.value = locale

  /**
   * NOTE:
   * If you need to specify the language setting for headers, such as the `fetch` API, set it here.
   * The following is an example for axios.
   *
   * axios.defaults.headers.common['Accept-Language'] = locale
   */
  document.querySelector('html')!.setAttribute('lang', locale)
}

const localeMessages: Record<string, MessageMap> = {
  'zh-CN': zhCN,
  'en-US': enUS
}

/**
 * Load locale messages dynamically
 * @param i18n - i18n instance
 * @param locale - locale string
 * @returns Promise that resolves when messages are loaded
 */
export async function loadLocaleMessages(i18n: I18nInstance, locale: string): Promise<void> {
  let messages: MessageMap

  try {
    messages = localeMessages[locale]
    if (!messages) {
      throw new Error(`Locale "${locale}" not found`)
    }
  } catch (error) {
    console.error(`[loadLocaleMessages] Failed to load locale "${locale}":`, error)
    try {
      const fallbackLocale = locale === 'zh-CN' ? 'en-US' : 'zh-CN'
      messages = localeMessages[fallbackLocale]
      if (!messages) {
        throw new Error(`Fallback locale "${fallbackLocale}" not found`)
      }
      console.warn(`[loadLocaleMessages] Fallback to "${fallbackLocale}"`)
    } catch (fallbackError) {
      console.error(`[loadLocaleMessages] Fallback locale also failed:`, fallbackError)
      throw error
    }
  }

  const globalMessages = i18n.global as unknown as {
    setLocaleMessage?: (locale: string, messages: MessageMap) => void
    messages?: Record<string, MessageMap>
  }

  if (typeof globalMessages.setLocaleMessage === 'function') {
    globalMessages.setLocaleMessage(locale, messages)
  } else if (globalMessages.messages && typeof globalMessages.messages === 'object') {
    globalMessages.messages[locale] = messages
  } else {
    globalMessages.messages = { [locale]: messages }
  }

  return nextTick()
}
