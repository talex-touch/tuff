import en from './locales/en'
import zh from './locales/zh'

export default defineI18nConfig(() => ({
  legacy: false,
  locale: 'en',
  fallbackLocale: 'en',
  messages: {
    en,
    zh,
  },
}))
