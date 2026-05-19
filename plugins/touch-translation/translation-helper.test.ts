import { describe, expect, it } from 'vitest'
import {
  parseImageDataUrl,
  toImageDataUrl,
} from './index/utils'
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

  it('parses and builds image data urls for screenshot translation', () => {
    expect(parseImageDataUrl('data:image/png;base64, aGVs bG8= ')).toEqual({
      mime: 'image/png',
      base64: 'aGVsbG8=',
    })

    expect(parseImageDataUrl('data:text/plain;base64,aGVsbG8=')).toBeNull()
    expect(toImageDataUrl('aGVsbG8=', 'image/jpeg')).toBe('data:image/jpeg;base64,aGVsbG8=')
    expect(toImageDataUrl('aGVsbG8=', 'text/plain')).toBe('data:image/png;base64,aGVsbG8=')
  })
})
