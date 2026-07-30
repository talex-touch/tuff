import type { IntelligenceProviderStoredConfig } from '../transport/sdk/domains/intelligence'
import { describe, expect, it, vi } from 'vitest'
import {
  createIntelligenceSdk,
  intelligenceApiEvents,
  normalizeIntelligenceProviderConfigSaveRequest,
} from '../transport/sdk/domains/intelligence'
import { IntelligenceProviderType } from '../types/intelligence'

const CREDENTIAL = '  synthetic-provider-credential  '

function provider(): IntelligenceProviderStoredConfig {
  return {
    id: 'openai-default',
    type: IntelligenceProviderType.OPENAI,
    name: 'Synthetic OpenAI',
    enabled: true,
    authRef: 'provider-credential:openai-default',
    hasCredential: true,
    models: ['gpt-test'],
    rateLimit: { requestsPerMinute: 10 },
    metadata: { origin: 'local-settings' },
  }
}

describe('intelligence provider credential SDK', () => {
  it('preserves credential whitespace while sending and returning exact safe DTOs', async () => {
    const send = vi.fn(async (event, request) => {
      expect(event).toBe(intelligenceApiEvents.saveProviderConfig)
      expect(request).toMatchObject({
        credential: { action: 'set', value: CREDENTIAL },
      })
      return { ok: true, result: provider() }
    })
    const sdk = createIntelligenceSdk({ send } as never)

    await expect(
      sdk.saveProviderConfig({
        provider: provider(),
        credential: { action: 'set', value: CREDENTIAL },
      }),
    ).resolves.toEqual(provider())
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('normalizes transient provider tests while preserving credential whitespace', async () => {
    const send = vi.fn(async (event, request) => {
      expect(event).toBe(intelligenceApiEvents.testProvider)
      expect(request).toMatchObject({ provider: { apiKey: CREDENTIAL } })
      return { ok: true, result: { success: true, message: 'ok' } }
    })
    const sdk = createIntelligenceSdk({ send } as never)

    await expect(sdk.testProvider({ ...provider(), apiKey: CREDENTIAL })).resolves.toEqual({
      success: true,
      message: 'ok',
    })
    await expect(sdk.testProvider({ ...provider(), metadata: { token: 'nested-secret' } })).rejects.toThrow(
      'PROVIDER_CREDENTIAL_REQUEST_INVALID',
    )
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('rejects accessors, proxies, sparse arrays, cycles, classes and nested credentials', () => {
    class HostObject {
      value = 'unsafe'
    }
    const cyclic: Record<string, unknown> = {}
    cyclic.self = cyclic
    const sparse = Array.from({ length: 2 })
    sparse[1] = 'gpt-test'
    const proxyOwnKeys = vi.fn(() => [])
    const getter = vi.fn(() => ({ origin: 'accessor' }))
    const hostileValues = [
      { ...provider(), metadata: { apiKey: 'nested-secret' } },
      { ...provider(), metadata: new HostObject() },
      { ...provider(), metadata: cyclic },
      { ...provider(), models: sparse },
      { ...provider(), metadata: new Proxy({}, { ownKeys: proxyOwnKeys }) },
      Object.defineProperty({ ...provider() }, 'metadata', {
        enumerable: true,
        get: getter,
      }),
    ]

    for (const value of hostileValues) {
      expect(() =>
        normalizeIntelligenceProviderConfigSaveRequest({
          provider: value,
          credential: { action: 'preserve' },
        }),
      ).toThrow('PROVIDER_CREDENTIAL_REQUEST_INVALID')
    }
    expect(getter).not.toHaveBeenCalled()
    expect(proxyOwnKeys).not.toHaveBeenCalled()
  })

  it('rejects extra credential fields and oversized nested input before transport', async () => {
    const send = vi.fn()
    const sdk = createIntelligenceSdk({ send } as never)
    const oversizedModels = Array.from({ length: 257 }, (_, index) => `model-${index}`)

    await expect(
      sdk.saveProviderConfig({
        provider: provider(),
        credential: {
          action: 'set',
          value: 'synthetic',
          extra: true,
        } as never,
      }),
    ).rejects.toThrow('PROVIDER_CREDENTIAL_REQUEST_INVALID')
    await expect(
      sdk.saveProviderConfig({
        provider: { ...provider(), models: oversizedModels },
        credential: { action: 'preserve' },
      }),
    ).rejects.toThrow('PROVIDER_CREDENTIAL_REQUEST_INVALID')
    await expect(
      sdk.saveProviderConfig({
        provider: { ...provider(), authRef: undefined, hasCredential: true },
        credential: { action: 'preserve' },
      }),
    ).rejects.toThrow('PROVIDER_CREDENTIAL_REQUEST_INVALID')
    await expect(
      sdk.saveProviderConfig({
        provider: { ...provider(), hasCredential: false },
        credential: { action: 'preserve' },
      }),
    ).rejects.toThrow('PROVIDER_CREDENTIAL_REQUEST_INVALID')
    expect(send).not.toHaveBeenCalled()
  })

  it('rejects malformed main responses that expose credentials', async () => {
    const sdk = createIntelligenceSdk({
      send: vi.fn(async () => ({
        ok: true,
        result: { ...provider(), apiKey: 'response-secret' },
      })),
    } as never)

    await expect(
      sdk.saveProviderConfig({
        provider: provider(),
        credential: { action: 'preserve' },
      }),
    ).rejects.toThrow('PROVIDER_CREDENTIAL_REQUEST_INVALID')
  })
})
