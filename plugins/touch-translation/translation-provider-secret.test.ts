import { beforeEach, describe, expect, it, vi } from 'vitest'

const sdkMocks = vi.hoisted(() => ({
  secret: {
    delete: vi.fn(),
    get: vi.fn(),
    health: vi.fn(),
    set: vi.fn(),
  },
  storage: {
    getFile: vi.fn(),
    setFile: vi.fn(),
  },
}))

vi.mock('@talex-touch/utils/plugin/sdk', () => ({
  usePluginSecret: () => sdkMocks.secret,
  usePluginStorage: () => sdkMocks.storage,
}))

async function flushAsyncInit() {
  for (let i = 0; i < 8; i++) {
    await Promise.resolve()
  }
}

describe('touch-translation provider secret storage', () => {
  beforeEach(() => {
    vi.resetModules()
    sdkMocks.secret.delete.mockReset()
    sdkMocks.secret.get.mockReset()
    sdkMocks.secret.health.mockReset()
    sdkMocks.secret.set.mockReset()
    sdkMocks.storage.getFile.mockReset()
    sdkMocks.storage.setFile.mockReset()
  })

  it('sanitizes legacy provider secrets even when secure-store migration fails', async () => {
    vi.resetModules()
    sdkMocks.secret.get.mockResolvedValue('')
    sdkMocks.secret.set.mockResolvedValue({ success: false })
    sdkMocks.storage.getFile.mockResolvedValue({
      tencent: {
        enabled: true,
        config: {
          apiUrl: 'https://tmt.tencentcloudapi.com',
          region: 'ap-shanghai',
          secretId: 'legacy-id',
          secretKey: 'legacy-key',
        },
      },
    })
    sdkMocks.storage.setFile.mockResolvedValue(undefined)

    const { useTranslationProvider } = await import('./src/composables/useTranslationProvider')
    useTranslationProvider()
    await flushAsyncInit()

    expect(sdkMocks.secret.set).toHaveBeenCalledWith('providers.tencent.secretId', 'legacy-id')
    expect(sdkMocks.secret.set).toHaveBeenCalledWith('providers.tencent.secretKey', 'legacy-key')
    expect(sdkMocks.storage.setFile).toHaveBeenCalledWith('providers_config', expect.objectContaining({
      tencent: {
        enabled: true,
        config: {
          apiUrl: 'https://tmt.tencentcloudapi.com',
          region: 'ap-shanghai',
        },
      },
    }))
  })

  it('keeps failed secret updates out of runtime config and normal storage', async () => {
    sdkMocks.secret.get.mockResolvedValue('')
    sdkMocks.secret.set.mockResolvedValue({ success: false, error: 'secure-store-unavailable' })
    sdkMocks.storage.getFile.mockResolvedValue(undefined)
    sdkMocks.storage.setFile.mockResolvedValue(undefined)

    const { useTranslationProvider } = await import('./src/composables/useTranslationProvider')
    const translationProvider = useTranslationProvider()
    await flushAsyncInit()

    translationProvider.updateProviderConfig('tencent', {
      apiUrl: 'https://tmt.tencentcloudapi.com',
      region: 'ap-shanghai',
      secretId: 'next-id',
      secretKey: 'next-key',
    })
    await flushAsyncInit()

    expect(sdkMocks.secret.set).toHaveBeenCalledWith('providers.tencent.secretId', 'next-id')
    expect(sdkMocks.secret.set).toHaveBeenCalledWith('providers.tencent.secretKey', 'next-key')
    expect(sdkMocks.storage.setFile).not.toHaveBeenCalled()

    const provider = translationProvider.getProvider('tencent')
    expect(provider?.config).toMatchObject({
      apiUrl: 'https://tmt.tencentcloudapi.com',
      region: 'ap-shanghai',
    })
    expect(provider?.config?.secretId).not.toBe('next-id')
    expect(provider?.config?.secretKey).not.toBe('next-key')
  })
})
