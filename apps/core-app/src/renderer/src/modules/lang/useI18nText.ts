import { getCurrentInstance } from 'vue'
import { useI18n } from 'vue-i18n'
import { createRendererLogger } from '~/utils/renderer-log'
import { getGlobalI18nInstance, resolveLoadedMessageText } from './i18n'

export type Translate = (key: string, params?: Record<string, unknown>) => string
type FallbackTranslator = (key: string, params?: Record<string, unknown>) => string

const textLog = createRendererLogger('I18nText')

/**
 * Translates, and refuses to hand a raw key to a caller that is about to put it on screen.
 *
 * The composer is tried first and answers almost always. When it does not — a key it cannot see, a
 * transport callback with no component around it, a window still booting with no global i18n yet —
 * the imported locale bundles are consulted, because they are module constants and are loaded long
 * before anything that asks a question. Only a key no bundle carries reaches the caller as a key,
 * and that is worth a line in the renderer log: `plugin.permissions.startup.title` appearing in a
 * dialog is a defect whether or not anyone is watching the console.
 */
export function useI18nText(fallback?: FallbackTranslator): { t: Translate } {
  const instance = getCurrentInstance()
  const composer = instance
    ? useI18n()
    : (() => {
        const i18n = getGlobalI18nInstance()
        return i18n?.global?.t ? { t: i18n.global.t.bind(i18n.global) } : null
      })()
  // vue-i18n's `t` is a pile of overloads whose second parameter is never optional, so it is taken
  // as the one signature callers here use.
  const askComposer = composer ? (composer.t as unknown as Translate) : null

  return {
    t: (key: string, params?: Record<string, unknown>) => {
      const fromComposer = askComposer
        ? params === undefined
          ? askComposer(key)
          : askComposer(key, params)
        : undefined
      if (fromComposer !== undefined && fromComposer !== key) return fromComposer

      const fromBundle = resolveLoadedMessageText(key, params)
      if (fromBundle !== null) return fromBundle

      const fromCaller = fallback?.(key, params)
      if (fromCaller !== undefined && fromCaller !== key) return fromCaller

      textLog.warn(`No message for "${key}" in any loaded locale`)
      return key
    }
  }
}
