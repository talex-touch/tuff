import { getCurrentInstance } from 'vue'
import { useI18n } from 'vue-i18n'
import { getGlobalI18nInstance } from './i18n'

export type Translate = (key: string, params?: Record<string, unknown>) => string
type FallbackTranslator = (key: string, params?: Record<string, unknown>) => string

export function useI18nText(fallback?: FallbackTranslator): { t: Translate } {
  const instance = getCurrentInstance()
  if (instance) {
    const { t } = useI18n()
    return { t }
  }

  const i18n = getGlobalI18nInstance()
  if (i18n?.global?.t) {
    return { t: i18n.global.t.bind(i18n.global) }
  }

  return {
    t: (key: string, params?: Record<string, unknown>) => (fallback ? fallback(key, params) : key)
  }
}
