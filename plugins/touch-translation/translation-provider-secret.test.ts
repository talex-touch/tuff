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

async function settle() {
  await new Promise(resolve => setTimeout(resolve, 0))
}

const LEGACY_TENCENT = {
  tencent: {
    enabled: true,
    config: {
      apiUrl: 'https://tmt.tencentcloudapi.com',
      region: 'ap-shanghai',
      secretId: 'synthetic-legacy-id',
      secretKey: 'synthetic-legacy-key',
    },
  },
}

function useStatefulVault() {
  const vault = new Map<string, string>()
  sdkMocks.secret.get.mockImplementation(async (key: string) => vault.get(key) ?? null)
  sdkMocks.secret.setMany.mockImplementation(async (entries: Array<{ key: string, value: string | null }>) => {
    for (const entry of entries) {
      if (entry.value === null)
        vault.delete(entry.key)
      else
        vault.set(entry.key, entry.value)
    }
    return { success: true }
  })
  return vault
}

function useUnavailableVault() {
  sdkMocks.secret.get.mockRejectedValue(new Error('secret-unavailable'))
  sdkMocks.secret.setMany.mockResolvedValue({ success: false, error: 'secure-store-unavailable' })
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

  it('loads provider credentials only through the Secret SDK', async () => {
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

  it('keeps failed secret updates out of runtime config and normal storage (fail-closed rollback)', async () => {
    sdkMocks.secret.get.mockResolvedValue('')
    sdkMocks.secret.setMany.mockResolvedValue({ success: false, error: 'secure-store-unavailable' })
    sdkMocks.storage.getFile.mockResolvedValue(undefined)
    sdkMocks.storage.setFile.mockResolvedValue(undefined)

    const { useTranslationProvider } = await import('./src/composables/useTranslationProvider')
    const translationProvider = useTranslationProvider()
    await flushAsyncInit()

    const initialRegion = translationProvider.getProvider('tencent')?.config?.region
    const result = await translationProvider.updateProviderConfig('tencent', {
      apiUrl: 'https://tmt.tencentcloudapi.com',
      region: 'ap-shanghai',
      secretId: '  next-id  ',
      secretKey: '  next-key  ',
    })

    expect(result).toEqual({ success: false, error: 'secure-store-unavailable' })
    expect(sdkMocks.secret.setMany).toHaveBeenCalledWith([
      { key: 'providers.tencent.secretId', value: '  next-id  ' },
      { key: 'providers.tencent.secretKey', value: '  next-key  ' },
    ])
    expect(sdkMocks.storage.setFile).not.toHaveBeenCalled()

    const provider = translationProvider.getProvider('tencent')
    expect(provider?.config?.region).toBe(initialRegion)
    expect(provider?.config?.secretId).not.toBe('  next-id  ')
    expect(provider?.config?.secretKey).not.toBe('  next-key  ')
  })

  it('migrates legacy provider credentials on load and serves them from the Secret SDK', async () => {
    const vault = useStatefulVault()
    sdkMocks.storage.getFile.mockResolvedValue(LEGACY_TENCENT)
    sdkMocks.storage.setFile.mockResolvedValue({ success: true })

    const { useTranslationProvider } = await import('./src/composables/useTranslationProvider')
    const translationProvider = useTranslationProvider()
    await settle()

    expect(sdkMocks.secret.setMany).toHaveBeenCalledTimes(1)
    expect(sdkMocks.secret.setMany).toHaveBeenCalledWith([
      { key: 'providers.tencent.secretId', value: 'synthetic-legacy-id' },
      { key: 'providers.tencent.secretKey', value: 'synthetic-legacy-key' },
    ])
    expect(sdkMocks.storage.setFile).toHaveBeenCalledTimes(1)
    expect(sdkMocks.storage.setFile).toHaveBeenCalledWith('providers_config', {
      tencent: { enabled: true, config: { apiUrl: 'https://tmt.tencentcloudapi.com', region: 'ap-shanghai' } },
    })
    expect(vault.get('providers.tencent.secretKey')).toBe('synthetic-legacy-key')
    expect(translationProvider.getProvider('tencent')?.config).toMatchObject({
      region: 'ap-shanghai',
      secretId: 'synthetic-legacy-id',
      secretKey: 'synthetic-legacy-key',
    })
  })

  it('keeps legacy credentials usable and on disk while the vault is unavailable', async () => {
    useUnavailableVault()
    sdkMocks.storage.getFile.mockResolvedValue(LEGACY_TENCENT)
    sdkMocks.storage.setFile.mockResolvedValue({ success: true })

    const { useTranslationProvider } = await import('./src/composables/useTranslationProvider')
    const translationProvider = useTranslationProvider()
    await settle()

    expect(sdkMocks.storage.setFile).not.toHaveBeenCalled()
    expect(translationProvider.getProvider('tencent')?.config).toMatchObject({
      secretId: 'synthetic-legacy-id',
      secretKey: 'synthetic-legacy-key',
    })

    translationProvider.toggleProvider('google', true)
    await settle()

    expect(sdkMocks.storage.setFile).toHaveBeenCalledTimes(1)
    expect(sdkMocks.storage.setFile.mock.calls[0]?.[1].tencent).toEqual(LEGACY_TENCENT.tencent)
  })

  it('stops reviving a pending legacy credential once the user saves or clears it', async () => {
    useUnavailableVault()
    sdkMocks.storage.getFile.mockResolvedValue(LEGACY_TENCENT)
    sdkMocks.storage.setFile.mockResolvedValue({ success: true })

    const { useTranslationProvider } = await import('./src/composables/useTranslationProvider')
    const translationProvider = useTranslationProvider()
    await settle()

    useStatefulVault()
    translationProvider.updateProviderConfig('tencent', {
      apiUrl: 'https://tmt.tencentcloudapi.com',
      region: 'ap-shanghai',
      secretId: 'synthetic-next-id',
      secretKey: '',
    })
    await settle()

    const saved = sdkMocks.storage.setFile.mock.calls.at(-1)?.[1]
    expect(saved.tencent.config).toEqual({ apiUrl: 'https://tmt.tencentcloudapi.com', region: 'ap-shanghai' })
    expect(translationProvider.getProvider('tencent')?.config?.secretId).toBe('synthetic-next-id')
  })

  it('drops pending legacy credentials when the provider config is reset', async () => {
    useUnavailableVault()
    sdkMocks.storage.getFile.mockResolvedValue(LEGACY_TENCENT)
    sdkMocks.storage.setFile.mockResolvedValue({ success: true })

    const { useTranslationProvider } = await import('./src/composables/useTranslationProvider')
    const translationProvider = useTranslationProvider()
    await settle()

    useStatefulVault()
    const resetResult = await translationProvider.resetProvidersConfig()
    expect(resetResult).toEqual({ success: true })

    const saved = sdkMocks.storage.setFile.mock.calls.at(-1)?.[1]
    expect(saved.tencent.config).not.toHaveProperty('secretId')
    expect(saved.tencent.config).not.toHaveProperty('secretKey')
    expect(JSON.stringify(saved)).not.toContain('synthetic-legacy')
  })

  it('aborts resetProvidersConfig fail-closed when secret deletion fails without wiping in-memory config', async () => {
    const vault = useStatefulVault()
    sdkMocks.storage.getFile.mockResolvedValue(LEGACY_TENCENT)
    sdkMocks.storage.setFile.mockResolvedValue({ success: true })

    const { useTranslationProvider } = await import('./src/composables/useTranslationProvider')
    const translationProvider = useTranslationProvider()
    await settle()

    expect(vault.get('providers.tencent.secretKey')).toBe('synthetic-legacy-key')
    sdkMocks.storage.setFile.mockClear()
    sdkMocks.secret.setMany.mockResolvedValueOnce({ success: false, error: 'vault-locked' })

    const result = await translationProvider.resetProvidersConfig()
    expect(result).toEqual({ success: false, error: 'vault-locked' })
    expect(sdkMocks.storage.setFile).not.toHaveBeenCalled()
    expect(translationProvider.getProvider('tencent')?.config).toMatchObject({
      region: 'ap-shanghai',
      secretId: 'synthetic-legacy-id',
      secretKey: 'synthetic-legacy-key',
    })
  })

  it('rolls back vault secrets if config persistence fails during updateProviderConfig or resetProvidersConfig', async () => {
    const vault = useStatefulVault()
    sdkMocks.storage.getFile.mockResolvedValue(LEGACY_TENCENT)
    sdkMocks.storage.setFile.mockResolvedValue({ success: true })

    const { useTranslationProvider } = await import('./src/composables/useTranslationProvider')
    const translationProvider = useTranslationProvider()
    await settle()

    expect(vault.get('providers.tencent.secretKey')).toBe('synthetic-legacy-key')

    // 1. Storage failure during updateProviderConfig rolls vault back to previous key
    sdkMocks.storage.setFile.mockRejectedValueOnce(new Error('disk-full'))
    const updateRes = await translationProvider.updateProviderConfig('tencent', {
      apiUrl: 'https://tmt.tencentcloudapi.com',
      region: 'ap-beijing',
      secretId: 'new-id',
      secretKey: 'new-key',
    })
    expect(updateRes.success).toBe(false)
    expect(vault.get('providers.tencent.secretId')).toBe('synthetic-legacy-id')
    expect(vault.get('providers.tencent.secretKey')).toBe('synthetic-legacy-key')

    // 2. Storage failure during resetProvidersConfig restores wiped vault keys
    sdkMocks.storage.setFile.mockRejectedValueOnce(new Error('disk-full'))
    const resetRes = await translationProvider.resetProvidersConfig()
    expect(resetRes.success).toBe(false)
    expect(vault.get('providers.tencent.secretId')).toBe('synthetic-legacy-id')
    expect(vault.get('providers.tencent.secretKey')).toBe('synthetic-legacy-key')
  })

  it('rejects cleartext external http:// apiUrl in updateProviderConfig before writing vault secrets', async () => {
    useStatefulVault()
    sdkMocks.storage.getFile.mockResolvedValue(undefined)
    sdkMocks.storage.setFile.mockResolvedValue({ success: true })

    const { useTranslationProvider } = await import('./src/composables/useTranslationProvider')
    const translationProvider = useTranslationProvider()
    await settle()

    sdkMocks.secret.setMany.mockClear()
    const res = await translationProvider.updateProviderConfig('deepl', {
      apiUrl: 'http://api-free.deepl.com/v2/translate',
      apiKey: 'secret-key',
    })
    expect(res.success).toBe(false)
    expect(res.error).toContain('HTTPS')
    expect(sdkMocks.secret.setMany).not.toHaveBeenCalled()
  })
})
