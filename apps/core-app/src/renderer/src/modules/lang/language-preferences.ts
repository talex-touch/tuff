export const SUPPORTED_LANGUAGES = [
  { key: 'zh-CN', name: '简体中文' },
  { key: 'en-US', name: 'English' }
] as const

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number]['key']
export type LanguagePreferenceSource = 'settings' | 'default'

export interface InitialLanguagePreferenceInput {
  settingLocale?: string | null
  settingFollowSystem?: boolean | null
  browserLanguage?: string | null
  intlLocale?: string | null
}

export interface InitialLanguagePreference {
  locale: SupportedLanguage
  followSystem: boolean
  source: LanguagePreferenceSource
}

const DEFAULT_LANGUAGE: SupportedLanguage = 'zh-CN'
const DEFAULT_FOLLOW_SYSTEM = true

export function resolveSupportedLocale(locale?: string | null): SupportedLanguage | null {
  if (!locale) return null
  const normalized = locale.replace('_', '-').toLowerCase()
  const matched = SUPPORTED_LANGUAGES.find((lang) => {
    const langKey = lang.key.toLowerCase()
    return normalized === langKey || normalized.startsWith(langKey.split('-')[0])
  })
  return matched?.key ?? null
}

function resolveSystemLanguage(
  browserLanguage?: string | null,
  intlLocale?: string | null,
  fallbackLocale?: string | null
): SupportedLanguage {
  const candidates = [browserLanguage, intlLocale, fallbackLocale]
  for (const candidate of candidates) {
    const resolved = resolveSupportedLocale(candidate)
    if (resolved) {
      return resolved
    }
  }
  return DEFAULT_LANGUAGE
}

function usesDefaultLanguageSetting(locale: SupportedLanguage, followSystem: boolean): boolean {
  return locale === DEFAULT_LANGUAGE && followSystem === DEFAULT_FOLLOW_SYSTEM
}

export function resolveInitialLanguagePreference(
  input: InitialLanguagePreferenceInput
): InitialLanguagePreference {
  const settingLocale = resolveSupportedLocale(input.settingLocale) ?? DEFAULT_LANGUAGE
  const settingFollowSystem =
    typeof input.settingFollowSystem === 'boolean'
      ? input.settingFollowSystem
      : DEFAULT_FOLLOW_SYSTEM

  const followSystem = settingFollowSystem
  return {
    locale: followSystem
      ? resolveSystemLanguage(input.browserLanguage, input.intlLocale, settingLocale)
      : settingLocale,
    followSystem,
    source: usesDefaultLanguageSetting(settingLocale, settingFollowSystem) ? 'default' : 'settings'
  }
}
