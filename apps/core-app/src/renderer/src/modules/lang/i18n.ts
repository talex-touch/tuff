import { nextTick } from 'vue'
import type { I18n } from 'vue-i18n'
import { createI18n } from 'vue-i18n'
import { createRendererLogger } from '~/utils/renderer-log'
import enUS from './en-US.json'
import zhCN from './zh-CN.json'

type MessageMap = Record<string, unknown>
type LocaleKey = string
export type I18nInstance = I18n<MessageMap, MessageMap, MessageMap, LocaleKey, false>

let globalI18nInstance: I18nInstance | null = null
const i18nLog = createRendererLogger('loadLocaleMessages')

export function getGlobalI18nInstance(): I18nInstance | null {
  return globalI18nInstance
}

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
  globalI18nInstance = i18n
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

/** Walks a dotted key through a bundle, tolerating a bundle that stores the key flat. */
function lookupLoadedMessage(bundle: MessageMap | undefined, key: string): string | undefined {
  if (!bundle) return undefined

  const direct = bundle[key]
  if (typeof direct === 'string') return direct

  let cursor: unknown = bundle
  for (const segment of key.split('.')) {
    if (!cursor || typeof cursor !== 'object') return undefined
    cursor = (cursor as Record<string, unknown>)[segment]
  }
  return typeof cursor === 'string' ? cursor : undefined
}

/** `{placeholders}` the way vue-i18n writes them, so both paths read the same. */
function fillLoadedMessage(template: string, params?: Record<string, unknown>): string {
  if (!params) return template
  return template.replace(/\{(\w+)\}/g, (match, name) =>
    params[name] === undefined ? match : String(params[name])
  )
}

/**
 * Resolve a key against the bundles this window has actually loaded.
 *
 * The composer can be out of reach — a transport callback has no component instance, and a window
 * still booting has no global i18n yet — and a caller that then falls back to the key itself puts
 * `plugin.permissions.startup.title` on screen. The bundles are module constants, so they answer
 * regardless of how far the app got: the question is only which language is being read, and the
 * active locale is preferred over the rest.
 *
 * Returns null when no loaded bundle carries the key, which is the one case a caller has to decide
 * about itself.
 */
export function resolveLoadedMessageText(
  key: string,
  params?: Record<string, unknown>
): string | null {
  if (!key) return null

  const activeLocale = getGlobalI18nInstance()?.global?.locale?.value
  const candidates = [activeLocale, ...Object.keys(localeMessages)]
  const tried = new Set<string>()

  for (const locale of candidates) {
    if (typeof locale !== 'string' || tried.has(locale)) continue
    tried.add(locale)
    const template = lookupLoadedMessage(localeMessages[locale], key)
    if (template !== undefined) return fillLoadedMessage(template, params)
  }

  return null
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
    i18nLog.error(`Failed to load locale "${locale}"`, error)
    try {
      const fallbackLocale = locale === 'zh-CN' ? 'en-US' : 'zh-CN'
      messages = localeMessages[fallbackLocale]
      if (!messages) {
        throw new Error(`Fallback locale "${fallbackLocale}" not found`)
      }
      i18nLog.warn(`Fallback to "${fallbackLocale}"`)
    } catch (fallbackError) {
      i18nLog.error('Fallback locale also failed', fallbackError)
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
