import { beforeEach, describe, expect, it, vi } from 'vitest'
import { IntelligenceProviderType } from '@talex-touch/tuff-intelligence'

const networkMocks = vi.hoisted(() => ({
  request: vi.fn()
}))

vi.mock('../../network', () => ({
  getNetworkService: () => networkMocks
}))

vi.mock('../../nexus/runtime-base', () => ({
  getRuntimeNexusBaseUrl: () => 'https://nexus.example.com'
}))

import { isNexusProviderConfig, NexusProvider } from './nexus-provider'

describe('NexusProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    networkMocks.request.mockResolvedValue({
      data: {
        invocation: {
          capabilityId: 'text.chat',
          result: 'hello',
          usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
          model: 'gpt-4o-mini',
          latency: 42,
          traceId: 'trace_nexus_1',
          provider: 'ip_nexus_ai'
        }
      }
    })
  })

  it('识别默认 Tuff Nexus provider 配置', () => {
    expect(isNexusProviderConfig({ id: 'tuff-nexus-default' })).toBe(true)
    expect(isNexusProviderConfig({ metadata: { origin: 'tuff-nexus' } })).toBe(true)
    expect(isNexusProviderConfig({ id: 'custom-openai' })).toBe(false)
  })

  it('使用 app bearer token 调用 Nexus intelligence invoke API', async () => {
    const provider = new NexusProvider({
      id: 'tuff-nexus-default',
      type: IntelligenceProviderType.CUSTOM,
      name: 'Tuff Nexus',
      enabled: true,
      apiKey: 'app-token',
      defaultModel: 'gpt-4o-mini',
      priority: 1,
      metadata: { origin: 'tuff-nexus', tokenMode: 'auth' }
    })

    const result = await provider.chat(
      { messages: [{ role: 'user', content: 'hi' }] },
      { timeout: 12_000, metadata: { capabilityId: 'text.chat' } }
    )

    expect(networkMocks.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        url: 'https://nexus.example.com/api/v1/intelligence/invoke',
        headers: expect.objectContaining({
          Authorization: 'Bearer app-token',
          'Content-Type': 'application/json'
        }),
        body: expect.objectContaining({
          capabilityId: 'text.chat',
          payload: {
            messages: [{ role: 'user', content: 'hi' }]
          }
        }),
        timeoutMs: 12_000
      })
    )
    expect(result).toMatchObject({
      result: 'hello',
      usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
      model: 'gpt-4o-mini',
      traceId: 'trace_nexus_1',
      provider: 'ip_nexus_ai'
    })
  })

  it('未登录 guest token 时阻止调用，让 SDK 可 fallback 到其他 provider', async () => {
    const provider = new NexusProvider({
      id: 'tuff-nexus-default',
      type: IntelligenceProviderType.CUSTOM,
      name: 'Tuff Nexus',
      enabled: true,
      apiKey: 'guest',
      priority: 1,
      metadata: { origin: 'tuff-nexus', tokenMode: 'guest' }
    })

    await expect(
      provider.chat({ messages: [{ role: 'user', content: 'hi' }] }, {})
    ).rejects.toThrow('NEXUS_AUTH_REQUIRED')
    expect(networkMocks.request).not.toHaveBeenCalled()
  })
})
