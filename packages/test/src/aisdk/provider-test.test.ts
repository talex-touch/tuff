import type { IntelligenceProviderConfig } from '@talex-touch/utils/types/intelligence'
import { IntelligenceProviderType } from '@talex-touch/utils/types/intelligence'
import { describe, expect, it } from 'vitest'
import { setIntelligenceProviderManager, tuffIntelligence } from '../../../../apps/core-app/src/main/modules/ai/intelligence-sdk'

function setMockProviderManager(chatImpl: () => Promise<unknown>) {
  const provider = { chat: chatImpl } as any
  setIntelligenceProviderManager({
    clear: () => {},
    registerFromConfig: () => provider,
    getEnabled: () => [],
    get: () => provider,
    createProviderInstance: () => provider,
  } as any)
}

describe('tuffIntelligence Provider Testing Service', () => {
  it('should return error when provider is disabled', async () => {
    const disabledProvider: IntelligenceProviderConfig = {
      id: 'test-disabled',
      type: IntelligenceProviderType.OPENAI,
      name: 'Test Disabled',
      enabled: false,
      apiKey: 'test-key',
    }

    const result = await tuffIntelligence.testProvider(disabledProvider)

    expect(result.success).toBe(false)
    expect(result.message).toBe('Provider is disabled')
    expect(result.timestamp).toBeDefined()
  })

  it('should return error when API key is missing for non-local provider', async () => {
    const providerWithoutKey: IntelligenceProviderConfig = {
      id: 'test-no-key',
      type: IntelligenceProviderType.OPENAI,
      name: 'Test No Key',
      enabled: true,
    }

    const result = await tuffIntelligence.testProvider(providerWithoutKey)

    expect(result.success).toBe(false)
    expect(result.message).toBe('API key is required')
    expect(result.timestamp).toBeDefined()
  })

  it('should handle network errors gracefully', async () => {
    setMockProviderManager(async () => {
      throw new Error('network error')
    })

    const invalidProvider: IntelligenceProviderConfig = {
      id: 'test-invalid',
      type: IntelligenceProviderType.OPENAI,
      name: 'Test Invalid',
      enabled: true,
      apiKey: 'invalid-key',
      baseUrl: 'https://invalid-url-that-does-not-exist.example.com',
      timeout: 5000,
    }

    const result = await tuffIntelligence.testProvider(invalidProvider)

    expect(result.success).toBe(false)
    expect(result.message).toBeDefined()
    expect(result.latency).toBeDefined()
    expect(result.timestamp).toBeDefined()
  })

  it('should handle timeout errors', async () => {
    setMockProviderManager(async () => new Promise(() => {}))

    const timeoutProvider: IntelligenceProviderConfig = {
      id: 'test-timeout',
      type: IntelligenceProviderType.OPENAI,
      name: 'Test Timeout',
      enabled: true,
      apiKey: 'test-key',
      timeout: 10, // Very short timeout to trigger timeout error
    }

    const result = await tuffIntelligence.testProvider(timeoutProvider)

    expect(result.success).toBe(false)
    expect(result.message.toLowerCase()).toContain('timeout')
    expect(result.timestamp).toBeDefined()
  })

  it('should return latency information on failure', async () => {
    setMockProviderManager(async () => {
      await new Promise(resolve => setTimeout(resolve, 10))
      throw new Error('network error')
    })

    const provider: IntelligenceProviderConfig = {
      id: 'test-latency',
      type: IntelligenceProviderType.OPENAI,
      name: 'Test Latency',
      enabled: true,
      apiKey: 'invalid-key',
      timeout: 5000,
    }

    const result = await tuffIntelligence.testProvider(provider)

    expect(result.latency).toBeDefined()
    expect(typeof result.latency).toBe('number')
    expect(result.latency).toBeGreaterThan(0)
  })
})
