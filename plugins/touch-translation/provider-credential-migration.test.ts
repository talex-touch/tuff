import { describe, expect, it, vi } from 'vitest'
import { getProviderSecretKey, PROVIDER_SECRET_FIELDS } from './src/composables/useTranslationProvider'
import { migrateLegacyProviderCredentials } from './src/utils/provider-credential-migration'

const LEGACY = {
  google: { enabled: true, config: {} },
  deepl: { enabled: false, config: { apiKey: 'synthetic-legacy-deepl', apiUrl: 'https://api-free.deepl.com/v2/translate' } },
  tencent: {
    enabled: true,
    config: {
      apiUrl: 'https://tmt.tencentcloudapi.com',
      region: 'ap-shanghai',
      secretId: 'synthetic-legacy-id',
      secretKey: 'synthetic-legacy-key',
    },
  },
  caiyun: { enabled: false, config: { token: 'synthetic-legacy-caiyun' } },
}

const SANITIZED = {
  google: { enabled: true, config: {} },
  deepl: { enabled: false, config: { apiUrl: 'https://api-free.deepl.com/v2/translate' } },
  tencent: { enabled: true, config: { apiUrl: 'https://tmt.tencentcloudapi.com', region: 'ap-shanghai' } },
  caiyun: { enabled: false, config: {} },
}

const LEGACY_WRITES = [
  { key: 'providers.deepl.apiKey', value: 'synthetic-legacy-deepl' },
  { key: 'providers.tencent.secretId', value: 'synthetic-legacy-id' },
  { key: 'providers.tencent.secretKey', value: 'synthetic-legacy-key' },
  { key: 'providers.caiyun.token', value: 'synthetic-legacy-caiyun' },
]

const LEGACY_PENDING = {
  deepl: { apiKey: 'synthetic-legacy-deepl' },
  tencent: { secretId: 'synthetic-legacy-id', secretKey: 'synthetic-legacy-key' },
  caiyun: { token: 'synthetic-legacy-caiyun' },
}

function createHarness(initial: Record<string, any>, vaultInit: Record<string, string> = {}) {
  const vault = new Map(Object.entries(vaultInit))
  const calls: string[] = []
  let file = structuredClone(initial)
  const secret = {
    get: vi.fn(async (key: string) => vault.get(key) ?? null),
    setMany: vi.fn(async (entries: Array<{ key: string, value: string | null }>) => {
      calls.push('setMany')
      for (const entry of entries) {
        if (entry.value === null)
          vault.delete(entry.key)
        else
          vault.set(entry.key, entry.value)
      }
      return { success: true }
    }),
  }
  const persistConfig = vi.fn(async (config: Record<string, any>) => {
    calls.push('persist')
    file = structuredClone(config)
    return { success: true }
  })
  const run = () => migrateLegacyProviderCredentials({
    saved: file,
    fields: PROVIDER_SECRET_FIELDS,
    secretKey: getProviderSecretKey,
    vault: secret,
    persistConfig,
  })
  return { calls, persistConfig, run, secret, vault, getFile: () => file }
}

type SetMany = ReturnType<typeof createHarness>['secret']['setMany']

describe('touch-translation legacy provider credential migration', () => {
  it('leaves a config without credential fields untouched', async () => {
    const harness = createHarness(SANITIZED)

    expect(await harness.run()).toEqual({})

    expect(harness.secret.get).not.toHaveBeenCalled()
    expect(harness.secret.setMany).not.toHaveBeenCalled()
    expect(harness.persistConfig).not.toHaveBeenCalled()
    expect(harness.getFile()).toEqual(SANITIZED)
  })

  it('atomically migrates legacy fields and persists only sanitized config', async () => {
    const harness = createHarness(LEGACY)

    expect(await harness.run()).toEqual({})

    expect(harness.secret.setMany).toHaveBeenCalledTimes(1)
    expect(harness.secret.setMany).toHaveBeenCalledWith(LEGACY_WRITES)
    expect(harness.calls).toEqual(['setMany', 'persist'])
    expect(harness.persistConfig).toHaveBeenCalledWith(SANITIZED)
    expect(harness.getFile()).toEqual(SANITIZED)
    expect(JSON.stringify(harness.getFile())).not.toContain('synthetic-legacy')
    expect(Object.fromEntries(harness.vault)).toEqual(
      Object.fromEntries(LEGACY_WRITES.map(({ key, value }) => [key, value])),
    )
  })

  it('keeps an existing vault credential authoritative and removes its legacy mirror', async () => {
    const harness = createHarness(LEGACY, { 'providers.tencent.secretId': 'synthetic-vault-id' })

    expect(await harness.run()).toEqual({})

    expect(harness.vault.get('providers.tencent.secretId')).toBe('synthetic-vault-id')
    expect(harness.secret.setMany).toHaveBeenCalledWith(
      LEGACY_WRITES.filter(entry => entry.key !== 'providers.tencent.secretId'),
    )
    expect(harness.getFile()).toEqual(SANITIZED)
  })

  it('only sanitizes when every legacy credential is already in the vault', async () => {
    const harness = createHarness(LEGACY, Object.fromEntries(
      LEGACY_WRITES.map(({ key }) => [key, 'synthetic-vault-value']),
    ))

    expect(await harness.run()).toEqual({})

    expect(harness.secret.setMany).not.toHaveBeenCalled()
    expect(harness.persistConfig).toHaveBeenCalledWith(SANITIZED)
    expect(harness.vault.get('providers.tencent.secretKey')).toBe('synthetic-vault-value')
  })

  it('keeps the legacy file and reports pending credentials when the vault cannot be read', async () => {
    const harness = createHarness(LEGACY)
    harness.secret.get.mockRejectedValue(new Error('secret-unavailable'))

    expect(await harness.run()).toEqual(LEGACY_PENDING)

    expect(harness.secret.setMany).not.toHaveBeenCalled()
    expect(harness.persistConfig).not.toHaveBeenCalled()
    expect(harness.getFile()).toEqual(LEGACY)
  })

  it.each<[string, (setMany: SetMany) => unknown]>([
    ['rejects', setMany => setMany.mockRejectedValue(new Error('boom'))],
    ['reports failure', setMany => setMany.mockResolvedValue({ success: false })],
  ])('keeps the legacy file when the vault batch %s', async (_label, fail) => {
    const harness = createHarness(LEGACY)
    fail(harness.secret.setMany)

    expect(await harness.run()).toEqual(LEGACY_PENDING)

    expect(harness.persistConfig).not.toHaveBeenCalled()
    expect(harness.getFile()).toEqual(LEGACY)
    expect(harness.vault.size).toBe(0)
  })

  it('finishes the cleanup on the next load when the sanitized config could not be saved', async () => {
    const harness = createHarness(LEGACY)
    harness.persistConfig.mockRejectedValueOnce(new Error('disk-full'))

    expect(await harness.run()).toEqual({})

    expect(harness.getFile()).toEqual(LEGACY)
    expect(harness.vault.size).toBe(LEGACY_WRITES.length)

    expect(await harness.run()).toEqual({})

    expect(harness.secret.setMany).toHaveBeenCalledTimes(1)
    expect(harness.getFile()).toEqual(SANITIZED)
    expect(harness.vault.get('providers.tencent.secretKey')).toBe('synthetic-legacy-key')
  })

  it('is idempotent after a restart', async () => {
    const harness = createHarness(LEGACY)
    await harness.run()
    harness.secret.get.mockClear()
    harness.secret.setMany.mockClear()
    harness.persistConfig.mockClear()

    expect(await harness.run()).toEqual({})

    expect(harness.secret.get).not.toHaveBeenCalled()
    expect(harness.secret.setMany).not.toHaveBeenCalled()
    expect(harness.persistConfig).not.toHaveBeenCalled()
  })

  it('preserves credential whitespace exactly', async () => {
    const harness = createHarness({
      baidu: { enabled: true, config: { appId: 'synthetic-app', secretKey: '  synthetic padded key \n' } },
    })

    await harness.run()

    expect(harness.vault.get('providers.baidu.secretKey')).toBe('  synthetic padded key \n')
  })

  it('drops blank and non-string credential fields without touching the vault', async () => {
    const harness = createHarness({
      deepl: { enabled: true, config: { apiKey: '   ', apiUrl: 'https://api-free.deepl.com/v2/translate' } },
      bing: { enabled: true, config: { apiKey: 12345, region: 'global' } },
      custom: { enabled: true, config: { apiKey: null } },
    })

    expect(await harness.run()).toEqual({})

    expect(harness.secret.get).not.toHaveBeenCalled()
    expect(harness.secret.setMany).not.toHaveBeenCalled()
    expect(harness.getFile()).toEqual({
      deepl: { enabled: true, config: { apiUrl: 'https://api-free.deepl.com/v2/translate' } },
      bing: { enabled: true, config: { region: 'global' } },
      custom: { enabled: true, config: {} },
    })
  })
})
