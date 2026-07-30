import { beforeEach, describe, expect, it, vi } from 'vitest'

const sdkMocks = vi.hoisted(() => ({
  secret: {
    delete: vi.fn(),
    get: vi.fn(),
    health: vi.fn(),
    set: vi.fn(),
    setMany: vi.fn(),
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
    sdkMocks.secret.setMany.mockReset()
    sdkMocks.storage.getFile.mockReset()
    sdkMocks.storage.setFile.mockReset()
  })

  it('loads main-migrated provider credentials only through the Secret SDK', async () => {
    vi.resetModules()
    sdkMocks.secret.get.mockImplementation(async (key: string) => {
      if (key === 'providers.tencent.secretId')
        return 'synthetic-secure-id'
      if (key === 'providers.tencent.secretKey')
        return 'synthetic-secure-key'
      return ''
    })
    sdkMocks.storage.getFile.mockResolvedValue({
      tencent: {
        enabled: true,
        config: {
          apiUrl: 'https://tmt.tencentcloudapi.com',
          region: 'ap-shanghai',
        },
      },
    })

    const { useTranslationProvider } = await import('./src/composables/useTranslationProvider')
    const translationProvider = useTranslationProvider()
    await flushAsyncInit()

    expect(sdkMocks.secret.setMany).not.toHaveBeenCalled()
    expect(sdkMocks.storage.setFile).not.toHaveBeenCalled()
    expect(translationProvider.getProvider('tencent')?.config).toMatchObject({
      secretId: 'synthetic-secure-id',
      secretKey: 'synthetic-secure-key',
    })
  })

  it('keeps failed secret updates out of runtime config and normal storage', async () => {
    sdkMocks.secret.get.mockResolvedValue('')
    sdkMocks.secret.setMany.mockResolvedValue({ success: false, error: 'secure-store-unavailable' })
    sdkMocks.storage.getFile.mockResolvedValue(undefined)
    sdkMocks.storage.setFile.mockResolvedValue(undefined)

    const { useTranslationProvider } = await import('./src/composables/useTranslationProvider')
    const translationProvider = useTranslationProvider()
    await flushAsyncInit()

    translationProvider.updateProviderConfig('tencent', {
      apiUrl: 'https://tmt.tencentcloudapi.com',
      region: 'ap-shanghai',
      secretId: '  next-id  ',
      secretKey: '  next-key  ',
    })
    await flushAsyncInit()

    expect(sdkMocks.secret.setMany).toHaveBeenCalledWith([
      { key: 'providers.tencent.secretId', value: '  next-id  ' },
      { key: 'providers.tencent.secretKey', value: '  next-key  ' },
    ])
    expect(sdkMocks.storage.setFile).not.toHaveBeenCalled()

    const provider = translationProvider.getProvider('tencent')
    expect(provider?.config).toMatchObject({
      apiUrl: 'https://tmt.tencentcloudapi.com',
      region: 'ap-shanghai',
    })
    expect(provider?.config?.secretId).not.toBe('  next-id  ')
    expect(provider?.config?.secretKey).not.toBe('  next-key  ')
  })
})
