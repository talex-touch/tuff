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
        settingFollowSystem: false
      })
    ).toMatchObject({
      locale: 'en-US',
      followSystem: false,
      source: 'settings'
    })
  })

  it('uses app settings once they only partially diverge from defaults', () => {
    expect(
      resolvePreference({
        settingLocale: 'zh-CN',
        settingFollowSystem: false
      })
    ).toMatchObject({
      locale: 'zh-CN',
      followSystem: false,
      source: 'settings'
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
      followSystem: true,
      source: 'default'
    })
  })
})
