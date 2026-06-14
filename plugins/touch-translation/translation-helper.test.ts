import { TuffItemBuilder } from '@talex-touch/utils'
import {
  getEnabledProviderIds,
  normalizeTranslationErrorMessage,
  resolveTargetLanguage,
} from '@talex-touch/utils/plugin'
import { describe, expect, it } from 'vitest'
import {
  parseImageDataUrl,
  toImageDataUrl,
} from './index/utils'
import {
  canPersistProviderSecrets,
  getProviderSecretKey,
  stripProviderSecrets,
} from './src/composables/useTranslationProvider'

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

  it('keeps provider secrets out of normal plugin storage payloads', () => {
    expect(getProviderSecretKey('tencent', 'secretKey')).toBe('providers.tencent.secretKey')
    expect(stripProviderSecrets('tencent', {
      secretId: 'id-plain',
      secretKey: 'secret-plain',
      region: 'ap-beijing',
      apiUrl: 'https://tmt.tencentcloudapi.com',
    })).toEqual({
      region: 'ap-beijing',
      apiUrl: 'https://tmt.tencentcloudapi.com',
    })
    expect(stripProviderSecrets('google', {
      apiUrl: 'https://translate.googleapis.com',
    })).toEqual({
      apiUrl: 'https://translate.googleapis.com',
    })
  })

  it('blocks secret provider saves when secure storage is unavailable', () => {
    expect(canPersistProviderSecrets('google', null)).toBe(true)
    expect(canPersistProviderSecrets('tencent', null)).toBe(false)
    expect(canPersistProviderSecrets('tencent', {
      backend: 'unavailable',
      available: false,
      degraded: true,
      reason: 'secure-store-unavailable',
    })).toBe(false)
    expect(canPersistProviderSecrets('tencent', {
      backend: 'local-secret',
      available: true,
      degraded: true,
      reason: 'Using local root secret',
    })).toBe(true)
  })

  it('builds translation copy actions as plugin actions', async () => {
    const previousBuilder = (globalThis as any).TuffItemBuilder
    ;(globalThis as any).TuffItemBuilder = TuffItemBuilder

    try {
      const { createSuccessItem } = await import('./index/item-builder')
      const item = createSuccessItem('hello', {
        text: '你好',
        from: 'en',
        to: 'zh',
        service: 'google',
      }, 'translate')

      expect(item.meta?.defaultAction).toBe('copy')
      expect(item.actions).toContainEqual(expect.objectContaining({
        id: 'copy-translation',
        type: 'plugin',
        payload: { text: '你好' },
      }))
    }
    finally {
      ;(globalThis as any).TuffItemBuilder = previousBuilder
    }
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
