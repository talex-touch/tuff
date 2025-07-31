import { nextTick } from 'vue'
import { createI18n } from 'vue-i18n'

/**
 * Setup i18n instance with provided options
 * @param options - i18n options with default locale
 * @returns i18n instance
 */
export function setupI18n(options: { locale: string } = { locale: 'en-US' }): any {
  const i18n = createI18n(options)
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

/**
 * Load locale messages dynamically
 * @param i18n - i18n instance
 * @param locale - locale string
 * @returns Promise that resolves when messages are loaded
 */
export async function loadLocaleMessages(i18n: any, locale: string): Promise<void> {
  // load locale messages with dynamic import
  const messages = await import(
    /* webpackChunkName: "locale-[request]" */ `./locales/${locale}.json`
  )

  // set locale and locale message
  i18n.global.setLocaleMessage(locale, messages.default)

  return nextTick()
}
