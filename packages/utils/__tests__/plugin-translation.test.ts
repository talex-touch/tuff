import { describe, expect, it } from 'vitest'
import {
  getEnabledProviderIds,
  getProviderOrderIndex,
  normalizeTranslationErrorMessage,
  resolveTargetLanguage,
} from '../plugin/translation'

describe('plugin translation helpers', () => {
  it('resolves translation direction from text content', () => {
    expect(resolveTargetLanguage('你好，Tuff')).toBe('en')
    expect(resolveTargetLanguage('hello, tuff')).toBe('zh')
  })

  it('keeps enabled providers ordered by shared provider order', () => {
    const ids = getEnabledProviderIds({
      google: { enabled: true },
      tuffintelligence: { enabled: true },
      deepl: { enabled: true },
    })

    expect(ids).toEqual(['tuffintelligence', 'google', 'deepl'])
    expect(getProviderOrderIndex('google')).toBeLessThan(getProviderOrderIndex('deepl'))
  })

  it('normalizes permission and empty-input failures', () => {
    expect(normalizeTranslationErrorMessage('permission denied')).toBe('权限被拒绝：请在插件设置中授予所需权限后重试')
    expect(normalizeTranslationErrorMessage('无输入：当前为空')).toBe('无输入：请输入要翻译的文本')
  })
})
