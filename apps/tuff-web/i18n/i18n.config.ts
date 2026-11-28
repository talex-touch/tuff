import en from './locales/en'
import zh from './locales/zh'

export function createTuffWebI18nOptions() {
  return {
    legacy: false as const,
    globalInjection: true,
    locale: 'en' as const,
    fallbackLocale: 'en' as const,
    missingWarn: false,
    fallbackWarn: false,
    messages: {
      en,
      zh,
    },
  }
}

export default createTuffWebI18nOptions
