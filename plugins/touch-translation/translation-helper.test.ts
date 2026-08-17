import { TuffItemBuilder } from '@talex-touch/utils'
import {
  getEnabledProviderIds,
  normalizeTranslationErrorMessage,
  parseImageDataUrl,
  resolveTargetLanguage,
  toImageDataUrl,
} from '@talex-touch/utils/plugin'
import { describe, expect, it, vi } from 'vitest'
import {
  canPersistProviderSecrets,
  getProviderSecretKey,
  stripProviderSecrets,
} from './src/composables/useTranslationProvider'
import { MyMemoryTranslateProvider } from './src/providers/mymemory-translate'

const networkRequestMock = vi.hoisted(() => vi.fn())

vi.mock('./src/providers/plugin-network-client', () => ({
  getPluginNetworkClient: () => ({ request: networkRequestMock }),
}))

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

  it('normalizes image data URLs through utils barrel helpers', () => {
    const dataUrl = toImageDataUrl('aGVs\n bG8=', 'IMAGE/SVG+XML')

    expect(parseImageDataUrl(dataUrl)).toEqual({
      mime: 'image/svg+xml',
      base64: 'aGVsbG8=',
    })
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

  it('resolves MyMemory auto source language before issuing the host request', async () => {
    networkRequestMock.mockResolvedValueOnce({
      status: 200,
      statusText: 'OK',
      headers: {},
      data: {
        responseStatus: 200,
        responseData: { translatedText: '你好，世界' },
        matches: [],
      },
      url: 'https://api.mymemory.translated.net/get',
      ok: true,
    })

    const provider = new MyMemoryTranslateProvider()
    await expect(provider.translate({
      text: 'Hello world',
      targetLanguage: 'zh',
      sourceLanguage: 'auto',
    })).resolves.toMatchObject({ text: '你好，世界' })

    expect(networkRequestMock).toHaveBeenCalledWith(expect.objectContaining({
      responseType: 'json',
      url: expect.stringContaining('langpair=en%7Czh-CN'),
    }))
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

})
