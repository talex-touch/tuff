import { nextTick } from 'vue'
import { createI18n } from 'vue-i18n'
import zhCN from './zh-CN.json'
import enUS from './en-US.json'

/**
 * Setup i18n instance with provided options
 * @param options - i18n options with default locale
 * @returns i18n instance
 */
export async function setupI18n(options: { locale: string } = { locale: 'en-US' }): Promise<any> {
  const i18n = createI18n({
    legacy: false,
    locale: options.locale,
    messages: {}
  })

  await loadLocaleMessages(i18n, options.locale)

  setI18nLanguage(i18n, options.locale)
  return i18n
}

/**
 * Set the language for the i18n instance and HTML document
 * @param i18n - i18n instance
 * @param locale - locale string
 */
export function setI18nLanguage(i18n: any, locale: string): void {
  if (i18n.mode === 'legacy') {
    i18n.global.locale = locale
  } else {
    i18n.global.locale.value = locale
  }

  /**
   * NOTE:
   * If you need to specify the language setting for headers, such as the `fetch` API, set it here.
   * The following is an example for axios.
   *
   * axios.defaults.headers.common['Accept-Language'] = locale
   */
  document.querySelector('html')!.setAttribute('lang', locale)
}

const localeMessages: Record<string, any> = {
  'zh-CN': zhCN,
  'en-US': enUS
}

/**
 * Load locale messages dynamically
 * @param i18n - i18n instance
 * @param locale - locale string
 * @returns Promise that resolves when messages are loaded
 */
export async function loadLocaleMessages(i18n: any, locale: string): Promise<void> {
  let messages: any
  
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

  if (typeof i18n.global.setLocaleMessage === 'function') {
    i18n.global.setLocaleMessage(locale, messages)
  } else if (i18n.global.messages) {
    // Handle both reactive and non-reactive messages
    if (typeof i18n.global.messages.value === 'object') {
      i18n.global.messages.value[locale] = messages
    } else if (typeof i18n.global.messages === 'object') {
      i18n.global.messages[locale] = messages
    } else {
      // Fallback: directly set messages
      ;(i18n.global as any).messages = { [locale]: messages }
    }
  } else {
    // Direct fallback
    ;(i18n.global as any).messages = { [locale]: messages }
  }

  // Ensure messages are loaded
  if (!i18n.global.messages || (!i18n.global.messages.value?.[locale] && !(i18n.global.messages as any)[locale])) {
    console.warn(`[loadLocaleMessages] Failed to set messages for locale "${locale}", attempting fallback`)
    ;(i18n.global as any).messages = { [locale]: messages }
  }

  return nextTick()
}
