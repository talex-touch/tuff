import { hasDocument, hasNavigator, hasWindow } from '@talex-touch/utils/env'
import { createI18n } from 'vue-i18n'
import { en } from './en'
import { zh } from './zh'

export type ConsoleLocale = 'en' | 'zh'

const LOCALE_STORAGE_KEY = 'tuff-console-locale'

export function resolveInitialLocale(): ConsoleLocale {
  if (hasWindow()) {
    try {
      const saved = window.localStorage.getItem(LOCALE_STORAGE_KEY)
      if (saved === 'en' || saved === 'zh')
        return saved
    }
    catch {
      // Ignore storage access failures in private contexts.
    }
  }
  if (hasNavigator()) {
    const lang = (navigator.language || '').toLowerCase()
    if (lang.startsWith('zh'))
      return 'zh'
  }
  return 'en'
}

export const i18n = createI18n({
  legacy: false,
  locale: resolveInitialLocale(),
  fallbackLocale: 'en',
  messages: {
    en,
    zh,
  },
})

export function setConsoleLocale(locale: ConsoleLocale) {
  i18n.global.locale.value = locale
  if (hasDocument())
    document.documentElement.lang = locale === 'zh' ? 'zh-CN' : 'en'
  if (hasWindow()) {
    try {
      window.localStorage.setItem(LOCALE_STORAGE_KEY, locale)
    }
    catch {
      // Ignore storage errors.
    }
  }
}

export function toggleConsoleLocale(): ConsoleLocale {
  const next: ConsoleLocale = i18n.global.locale.value === 'zh' ? 'en' : 'zh'
  setConsoleLocale(next)
  return next
}
