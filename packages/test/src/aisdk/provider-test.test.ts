import type { AiProviderConfig } from '@tuff/utils/types/aisdk'
import { ai } from '@tuff/utils/aisdk'
import { AiProviderType } from '@tuff/utils/types/aisdk'
import { describe, expect, it } from 'vitest'

describe('aISDK Provider Testing Service', () => {
  it('should return error when provider is disabled', async () => {
    const disabledProvider: AiProviderConfig = {
      id: 'test-disabled',
      type: AiProviderType.OPENAI,
      name: 'Test Disabled',
      enabled: false,
      apiKey: 'test-key',
    }

    const result = await ai.testProvider(disabledProvider)

    expect(result.success).toBe(false)
    expect(result.message).toBe('Provider is disabled')
    expect(result.timestamp).toBeDefined()
  })

  it('should return error when API key is missing for non-local provider', async () => {
    const providerWithoutKey: AiProviderConfig = {
      id: 'test-no-key',
      type: AiProviderType.OPENAI,
      name: 'Test No Key',
      enabled: true,
    }

    const result = await ai.testProvider(providerWithoutKey)

    expect(result.success).toBe(false)
    expect(result.message).toBe('API key is required')
    expect(result.timestamp).toBeDefined()
  })

  it('should handle network errors gracefully', async () => {
    const invalidProvider: AiProviderConfig = {
      id: 'test-invalid',
      type: AiProviderType.OPENAI,
      name: 'Test Invalid',
      enabled: true,
      apiKey: 'invalid-key',
      baseUrl: 'https://invalid-url-that-does-not-exist.example.com',
      timeout: 5000,
    }

    const result = await ai.testProvider(invalidProvider)

    expect(result.success).toBe(false)
    expect(result.message).toBeDefined()
    expect(result.latency).toBeDefined()
    expect(result.timestamp).toBeDefined()
  })

  it('should handle timeout errors', async () => {
    const timeoutProvider: AiProviderConfig = {
      id: 'test-timeout',
      type: AiProviderType.OPENAI,
      name: 'Test Timeout',
      enabled: true,
      apiKey: 'test-key',
      timeout: 1, // Very short timeout to trigger timeout error
    }

    const result = await ai.testProvider(timeoutProvider)

    expect(result.success).toBe(false)
    expect(result.message).toContain('timeout')
    expect(result.timestamp).toBeDefined()
  })

  it('should return latency information on failure', async () => {
    const provider: AiProviderConfig = {
      id: 'test-latency',
      type: AiProviderType.OPENAI,
      name: 'Test Latency',
      enabled: true,
      apiKey: 'invalid-key',
      timeout: 5000,
    }

    const result = await ai.testProvider(provider)

    expect(result.latency).toBeDefined()
    expect(typeof result.latency).toBe('number')
    expect(result.latency).toBeGreaterThan(0)
  })
})
