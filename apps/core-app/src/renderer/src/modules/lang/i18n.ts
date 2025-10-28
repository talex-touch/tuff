import { nextTick } from 'vue'
import { createI18n } from 'vue-i18n'

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

/**
 * Load locale messages dynamically
 * @param i18n - i18n instance
 * @param locale - locale string
 * @returns Promise that resolves when messages are loaded
 */
export async function loadLocaleMessages(i18n: any, locale: string): Promise<void> {
  const messages = await import(/* webpackChunkName: "locale-[request]" */ `./${locale}.json`)

  if (typeof i18n.global.setLocaleMessage === 'function') {
    i18n.global.setLocaleMessage(locale, messages.default)
  } else if (i18n.global.messages && i18n.global.messages.value) {
    i18n.global.messages.value[locale] = messages.default
  } else {
    console.error('[loadLocaleMessages] i18n.global.messages is not available')
  }

  return nextTick()
}
