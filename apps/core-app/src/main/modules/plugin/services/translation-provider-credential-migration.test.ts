import { describe, expect, it, vi } from 'vitest'
import {
  isTranslationProviderConfigSafe,
  isTranslationProviderSecretKey,
  migrateTranslationProviderCredentials,
  resolveLegacyTranslationCredential,
  stripTranslationProviderCredentials
} from './translation-provider-credential-migration'

const LEGACY = {
  tencent: {
    enabled: true,
    config: {
      region: 'ap-shanghai',
      secretId: 'synthetic-legacy-id',
      secretKey: 'synthetic-legacy-key'
    }
  }
}

function createHarness(options: { secureFails?: boolean; configFails?: boolean } = {}) {
  const secure = new Map<string, string>()
  const persisted: unknown[] = []
  let applyCalls = 0
  return {
    secure,
    persisted,
    get applyCalls() {
      return applyCalls
    },
    dependencies: {
      pluginName: 'touch-translation',
      config: structuredClone(LEGACY) as Record<string, unknown>,
      getSecret: vi.fn(async (key: string) => secure.get(key) ?? null),
      applySecrets: vi.fn(async (entries: readonly { key: string; value: string | null }[]) => {
        applyCalls += 1
        if (options.secureFails && applyCalls === 1) return false
        for (const entry of entries) {
          if (entry.value === null) secure.delete(entry.key)
          else secure.set(entry.key, entry.value)
        }
        return true
      }),
      persistConfig: vi.fn(async (config: Record<string, unknown>) => {
        if (options.configFails) return false
        persisted.push(structuredClone(config))
        return true
      })
    }
  }
}

describe('translation provider credential migration', () => {
  it('accepts only the fixed official Translation Secret key catalog', () => {
    expect(isTranslationProviderSecretKey('providers.tencent.secretId')).toBe(true)
    expect(isTranslationProviderSecretKey('providers.tencent.secretKey')).toBe(true)
    expect(isTranslationProviderSecretKey('providers.custom.accessToken')).toBe(false)
    expect(isTranslationProviderSecretKey('providers.unknown.apiKey')).toBe(false)
    expect(isTranslationProviderConfigSafe({ google: { enabled: true, config: {} } })).toBe(true)
    expect(
      isTranslationProviderConfigSafe({ tencent: { config: { secretKey: 'synthetic-secret' } } })
    ).toBe(false)
  })

  it('does nothing on a fresh config', async () => {
    const harness = createHarness()
    harness.dependencies.config = { google: { enabled: true, config: {} } }

    const result = await migrateTranslationProviderCredentials(harness.dependencies)

    expect(result.migrated).toBe(0)
    expect(harness.dependencies.applySecrets).not.toHaveBeenCalled()
    expect(harness.dependencies.persistConfig).not.toHaveBeenCalled()
  })

  it('atomically migrates legacy fields and persists only sanitized config', async () => {
    const harness = createHarness()

    const result = await migrateTranslationProviderCredentials(harness.dependencies)

    expect(result.migrated).toBe(2)
    expect(harness.secure.get('plugin.touch-translation.providers.tencent.secretId')).toBe(
      'synthetic-legacy-id'
    )
    expect(JSON.stringify(harness.persisted)).not.toContain('synthetic-legacy')
    expect(result.config).toEqual({
      tencent: {
        enabled: true,
        config: { region: 'ap-shanghai' }
      }
    })
  })

  it('keeps an existing secure credential authoritative while removing its legacy mirror', async () => {
    const harness = createHarness()
    harness.secure.set(
      'plugin.touch-translation.providers.tencent.secretId',
      'synthetic-current-secure-id'
    )

    const result = await migrateTranslationProviderCredentials(harness.dependencies)

    expect(result.migrated).toBe(1)
    expect(harness.secure.get('plugin.touch-translation.providers.tencent.secretId')).toBe(
      'synthetic-current-secure-id'
    )
    expect(harness.secure.get('plugin.touch-translation.providers.tencent.secretKey')).toBe(
      'synthetic-legacy-key'
    )
    expect(JSON.stringify(harness.persisted)).not.toContain('synthetic-legacy')
  })

  it('preserves the legacy config when the secure batch fails', async () => {
    const harness = createHarness({ secureFails: true })

    await expect(migrateTranslationProviderCredentials(harness.dependencies)).rejects.toThrow(
      'TRANSLATION_CREDENTIAL_SECURE_WRITE_FAILED'
    )

    expect(harness.persisted).toHaveLength(0)
    expect(JSON.stringify(harness.dependencies.config)).toContain('synthetic-legacy-key')
  })

  it('restores prior secure values when sanitized config persistence fails', async () => {
    const harness = createHarness({ configFails: true })
    harness.secure.set(
      'plugin.touch-translation.providers.tencent.secretId',
      'synthetic-previous-id'
    )

    await expect(migrateTranslationProviderCredentials(harness.dependencies)).rejects.toThrow(
      'TRANSLATION_CREDENTIAL_CONFIG_WRITE_FAILED'
    )

    expect(harness.secure.get('plugin.touch-translation.providers.tencent.secretId')).toBe(
      'synthetic-previous-id'
    )
    expect(harness.secure.has('plugin.touch-translation.providers.tencent.secretKey')).toBe(false)
  })

  it('is idempotent after restart with a sanitized config', async () => {
    const first = createHarness()
    const migrated = await migrateTranslationProviderCredentials(first.dependencies)
    const restart = createHarness()
    restart.dependencies.config = migrated.config

    const result = await migrateTranslationProviderCredentials(restart.dependencies)

    expect(result.migrated).toBe(0)
    expect(restart.dependencies.applySecrets).not.toHaveBeenCalled()
  })

  it('preserves non-empty credential whitespace exactly', async () => {
    const harness = createHarness()
    harness.dependencies.config = {
      tencent: {
        enabled: true,
        config: { secretId: '  synthetic-id  ', secretKey: 'synthetic-key' }
      }
    }

    await migrateTranslationProviderCredentials(harness.dependencies)

    expect(harness.secure.get('plugin.touch-translation.providers.tencent.secretId')).toBe(
      '  synthetic-id  '
    )
  })

  it('rejects a forged migration owner before secure storage access', async () => {
    const harness = createHarness()
    harness.dependencies.pluginName = 'forged-plugin'

    await expect(migrateTranslationProviderCredentials(harness.dependencies)).rejects.toThrow(
      'TRANSLATION_CREDENTIAL_OWNER_INVALID'
    )
    expect(harness.dependencies.getSecret).not.toHaveBeenCalled()
    expect(harness.dependencies.applySecrets).not.toHaveBeenCalled()
  })

  it('rolls back secure values when the plugin activation changes before config persistence', async () => {
    const harness = createHarness()
    let checks = 0
    const dependencies = {
      ...harness.dependencies,
      assertCurrent: () => {
        checks += 1
        if (checks === 2) throw new Error('TRANSLATION_CREDENTIAL_ACTIVATION_STALE')
      }
    }

    await expect(migrateTranslationProviderCredentials(dependencies)).rejects.toThrow(
      'TRANSLATION_CREDENTIAL_ACTIVATION_STALE'
    )

    expect(harness.applyCalls).toBe(2)
    expect(harness.secure.size).toBe(0)
    expect(harness.dependencies.persistConfig).not.toHaveBeenCalled()
  })

  it('maps secure dependency exceptions to stable migration failures', async () => {
    const readFailure = createHarness()
    readFailure.dependencies.getSecret.mockRejectedValue(
      new Error('native secure path with synthetic-secret')
    )
    await expect(migrateTranslationProviderCredentials(readFailure.dependencies)).rejects.toThrow(
      'TRANSLATION_CREDENTIAL_SECURE_READ_FAILED'
    )
    expect(readFailure.dependencies.applySecrets).not.toHaveBeenCalled()

    const writeFailure = createHarness()
    writeFailure.dependencies.applySecrets.mockRejectedValue(
      new Error('native secure write with synthetic-secret')
    )
    await expect(migrateTranslationProviderCredentials(writeFailure.dependencies)).rejects.toThrow(
      'TRANSLATION_CREDENTIAL_SECURE_WRITE_FAILED'
    )
    expect(writeFailure.dependencies.persistConfig).not.toHaveBeenCalled()

    const rollbackFailure = createHarness({ configFails: true })
    rollbackFailure.dependencies.applySecrets.mockResolvedValueOnce(true)
    rollbackFailure.dependencies.applySecrets.mockRejectedValueOnce(
      new Error('native rollback with synthetic-secret')
    )
    await expect(
      migrateTranslationProviderCredentials(rollbackFailure.dependencies)
    ).rejects.toThrow('TRANSLATION_CREDENTIAL_ROLLBACK_FAILED')
  })

  it('reports a stable rollback failure when config and compensation both fail', async () => {
    const harness = createHarness({ configFails: true })
    harness.dependencies.applySecrets.mockImplementationOnce(async (entries) => {
      for (const entry of entries) {
        if (entry.value === null) harness.secure.delete(entry.key)
        else harness.secure.set(entry.key, entry.value)
      }
      return true
    })
    harness.dependencies.applySecrets.mockResolvedValueOnce(false)

    await expect(migrateTranslationProviderCredentials(harness.dependencies)).rejects.toThrow(
      'TRANSLATION_CREDENTIAL_ROLLBACK_FAILED'
    )
  })

  it('rejects hostile config snapshots without invoking accessors or proxy traps', async () => {
    const getter = vi.fn(() => 'synthetic-secret')
    const accessorConfig = {
      tencent: {
        enabled: true,
        config: Object.defineProperty({}, 'secretId', {
          enumerable: true,
          get: getter
        })
      }
    }
    const ownKeys = vi.fn(() => [])
    const proxyConfig = new Proxy({}, { ownKeys })

    for (const config of [accessorConfig, proxyConfig]) {
      const harness = createHarness()
      harness.dependencies.config = config
      await expect(migrateTranslationProviderCredentials(harness.dependencies)).rejects.toThrow(
        'TRANSLATION_CREDENTIAL_CONFIG_INVALID'
      )
      expect(harness.dependencies.getSecret).not.toHaveBeenCalled()
    }
    expect(getter).not.toHaveBeenCalled()
    expect(ownKeys).not.toHaveBeenCalled()
  })

  it('projects no credential while retaining a main-side legacy fallback', () => {
    const sanitized = stripTranslationProviderCredentials(LEGACY)

    expect(JSON.stringify(sanitized)).not.toContain('synthetic-legacy')
    expect(resolveLegacyTranslationCredential(LEGACY, 'providers.tencent.secretKey')).toBe(
      'synthetic-legacy-key'
    )
  })
})
