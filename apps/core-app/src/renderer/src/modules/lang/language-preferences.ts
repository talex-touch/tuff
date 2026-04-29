import { hasWindow } from '@talex-touch/utils/env'

export const SUPPORTED_LANGUAGES = [
  { key: 'zh-CN', name: '简体中文' },
  { key: 'en-US', name: 'English' }
] as const

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number]['key']
export type LanguagePreferenceSource = 'settings' | 'legacy' | 'default'

export interface InitialLanguagePreferenceInput {
  settingLocale?: string | null
  settingFollowSystem?: boolean | null
  legacyLocale?: string | null
  legacyFollowSystem?: string | boolean | null
  browserLanguage?: string | null
  intlLocale?: string | null
}

export interface InitialLanguagePreference {
  locale: SupportedLanguage
  followSystem: boolean
  source: LanguagePreferenceSource
  shouldMigrateLegacy: boolean
}

export interface LegacyLanguagePreferenceSnapshot {
  locale: string | null
  followSystem: string | null
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

function normalizeFollowSystem(value: string | boolean | null | undefined): boolean | null {
  if (typeof value === 'boolean') return value
  if (value === 'true') return true
  if (value === 'false') return false
  return null
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

  const legacyLocale = resolveSupportedLocale(input.legacyLocale)
  const legacyFollowSystem = normalizeFollowSystem(input.legacyFollowSystem)
  const hasLegacySnapshot = legacyLocale !== null || legacyFollowSystem !== null

  if (hasLegacySnapshot && usesDefaultLanguageSetting(settingLocale, settingFollowSystem)) {
    const followSystem = legacyFollowSystem ?? DEFAULT_FOLLOW_SYSTEM
    return {
      locale: followSystem
        ? resolveSystemLanguage(input.browserLanguage, input.intlLocale, legacyLocale)
        : (legacyLocale ?? settingLocale),
      followSystem,
      source: 'legacy',
      shouldMigrateLegacy: true
    }
  }

  const followSystem = settingFollowSystem
  return {
    locale: followSystem
      ? resolveSystemLanguage(input.browserLanguage, input.intlLocale, settingLocale)
      : settingLocale,
    followSystem,
    source: usesDefaultLanguageSetting(settingLocale, settingFollowSystem) ? 'default' : 'settings',
    shouldMigrateLegacy: false
  }
}

export function readLegacyLanguagePreferenceSnapshot(): LegacyLanguagePreferenceSnapshot {
  if (!hasWindow()) {
    return {
      locale: null,
      followSystem: null
    }
  }

  return {
    locale: localStorage.getItem('app-language'),
    followSystem: localStorage.getItem('app-follow-system-language')
  }
}
