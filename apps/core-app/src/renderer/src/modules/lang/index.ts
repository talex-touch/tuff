export { loadLocaleMessages, setI18nLanguage, setupI18n } from './i18n'
export { useLanguage } from './useLanguage'
export type { I18nInstance } from './i18n'
export {
  readLegacyLanguagePreferenceSnapshot,
  resolveInitialLanguagePreference,
  resolveSupportedLocale,
  SUPPORTED_LANGUAGES,
  type SupportedLanguage
} from './language-preferences'
export { setupLanguageSync } from './useLanguageSync'
export { useI18nText, type Translate } from './useI18nText'
