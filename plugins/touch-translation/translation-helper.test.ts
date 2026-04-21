import { describe, expect, it } from 'vitest'
import {
  getEnabledProviderIds,
  normalizeTranslationErrorMessage,
  resolveTargetLanguage,
} from '@talex-touch/utils/plugin'

describe('touch-translation helper integration', () => {
  it('uses utils translation helpers for direction and provider ordering', () => {
    expect(resolveTargetLanguage('你好，世界')).toBe('en')
    expect(resolveTargetLanguage('hello world')).toBe('zh')

    const enabledProviders = getEnabledProviderIds({
      google: { enabled: true },
      tuffintelligence: { enabled: true },
      deepl: { enabled: true },
    })

    expect(enabledProviders).toEqual(['tuffintelligence', 'google', 'deepl'])
  })

  it('normalizes translation errors through utils helper', () => {
    expect(normalizeTranslationErrorMessage('permission denied')).toBe('权限被拒绝：请在插件设置中授予所需权限后重试')
  })
})
