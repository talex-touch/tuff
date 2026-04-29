import { describe, expect, it } from 'vitest'
import {
  resolveInitialLanguagePreference,
  resolveSupportedLocale,
  type InitialLanguagePreferenceInput
} from './language-preferences'

function resolvePreference(overrides: Partial<InitialLanguagePreferenceInput> = {}) {
  return resolveInitialLanguagePreference({
    settingLocale: 'zh-CN',
    settingFollowSystem: true,
    legacyLocale: null,
    legacyFollowSystem: null,
    browserLanguage: 'en-US',
    intlLocale: 'en-US',
    ...overrides
  })
}

describe('resolveSupportedLocale', () => {
  it('normalizes locale aliases to supported locales', () => {
    expect(resolveSupportedLocale('zh')).toBe('zh-CN')
    expect(resolveSupportedLocale('en')).toBe('en-US')
    expect(resolveSupportedLocale('en_GB')).toBe('en-US')
  })
})

describe('resolveInitialLanguagePreference', () => {
  it('uses app settings as source of truth once they diverge from defaults', () => {
    expect(
      resolvePreference({
        settingLocale: 'en-US',
        settingFollowSystem: false,
        legacyLocale: 'zh-CN',
        legacyFollowSystem: 'true'
      })
    ).toMatchObject({
      locale: 'en-US',
      followSystem: false,
      source: 'settings',
      shouldMigrateLegacy: false
    })
  })

  it('migrates legacy storage when settings still match defaults', () => {
    expect(
      resolvePreference({
        settingLocale: 'zh-CN',
        settingFollowSystem: true,
        legacyLocale: 'en-US',
        legacyFollowSystem: 'false'
      })
    ).toMatchObject({
      locale: 'en-US',
      followSystem: false,
      source: 'legacy',
      shouldMigrateLegacy: true
    })
  })

  it('resolves follow-system locale from browser candidates', () => {
    expect(
      resolvePreference({
        settingLocale: 'zh-CN',
        settingFollowSystem: true,
        browserLanguage: 'en-US',
        intlLocale: 'en-US'
      })
    ).toMatchObject({
      locale: 'en-US',
      followSystem: true
    })
  })
})
