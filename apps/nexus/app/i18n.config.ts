import en from '../i18n/locales/en'
import zh from '../i18n/locales/zh'

export default defineI18nConfig(() => ({
  legacy: false,
  locale: 'en',
  fallbackLocale: 'en',
  messages: {
    en,
    zh,
  },
}))
