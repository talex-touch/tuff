import type { IntelligenceProviderRecord } from './intelligenceStore'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { invokeIntelligenceCapability } from './tuffIntelligenceLabService'

const storeMocks = vi.hoisted(() => ({
  createAudit: vi.fn(),
  getSettings: vi.fn(),
}))

const providerBridgeMocks = vi.hoisted(() => ({
  getIntelligenceProviderApiKeyWithRegistryFallback: vi.fn(),
  listIntelligenceProvidersWithRegistryMirrors: vi.fn(),
}))

const creditStoreMocks = vi.hoisted(() => ({
  consumeCredits: vi.fn(),
}))

const langchainMocks = vi.hoisted(() => ({
  constructorArgs: vi.fn(),
  invoke: vi.fn(),
}))

vi.mock('./intelligenceStore', async () => {
  const actual = await vi.importActual<typeof import('./intelligenceStore')>('./intelligenceStore')
  return {
    ...actual,
    createAudit: storeMocks.createAudit,
    getSettings: storeMocks.getSettings,
  }
})

vi.mock('./intelligenceProviderRegistryBridge', () => providerBridgeMocks)

vi.mock('./creditsStore', () => creditStoreMocks)

vi.mock('@langchain/openai', () => ({
  ChatOpenAI: class {
    constructor(config: unknown) {
      langchainMocks.constructorArgs(config)
    }

    invoke(messages: unknown) {
      return langchainMocks.invoke(messages)
    }
  },
}))

function provider(overrides: Partial<IntelligenceProviderRecord> = {}): IntelligenceProviderRecord {
  return {
    id: 'ip_nexus_text',
    userId: 'user_1',
    type: 'openai',
    name: 'Nexus OpenAI',
    enabled: true,
    hasApiKey: true,
    baseUrl: 'https://api.openai.com/v1',
    models: ['gpt-4o-mini'],
    defaultModel: 'gpt-4o-mini',
    instructions: null,
    timeout: 30000,
    priority: 1,
    rateLimit: null,
    capabilities: ['text.chat', 'text.translate', 'text.summarize'],
    metadata: null,
    createdAt: '2026-05-12T00:00:00.000Z',
    updatedAt: '2026-05-12T00:00:00.000Z',
    ...overrides,
  }
}

describe('invokeIntelligenceCapability', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    storeMocks.getSettings.mockResolvedValue({
      userId: 'user_1',
      defaultStrategy: 'priority',
      enableAudit: true,
      enableCache: true,
      cacheExpiration: 3600,
      updatedAt: '2026-05-12T00:00:00.000Z',
    })
    providerBridgeMocks.listIntelligenceProvidersWithRegistryMirrors.mockResolvedValue([
      provider(),
    ])
    providerBridgeMocks.getIntelligenceProviderApiKeyWithRegistryFallback.mockResolvedValue('sk-test')
    creditStoreMocks.consumeCredits.mockResolvedValue(undefined)
    langchainMocks.invoke.mockResolvedValue({
      content: 'translated text',
      usage_metadata: {
        input_tokens: 3,
        output_tokens: 4,
        total_tokens: 7,
      },
    })
  })

  it('通过 Nexus provider registry 配置调用文本能力并记录脱敏审计', async () => {
    const result = await invokeIntelligenceCapability({} as any, 'user_1', {
      capabilityId: 'text.translate',
      payload: {
        text: 'hello',
        sourceLang: 'en',
        targetLang: 'zh',
      },
      options: {
        modelPreference: ['gpt-4o-mini'],
        metadata: { sessionId: 'session_1' },
      },
    })

    expect(providerBridgeMocks.listIntelligenceProvidersWithRegistryMirrors).toHaveBeenCalledWith(
      expect.anything(),
      'user_1',
    )
    expect(providerBridgeMocks.getIntelligenceProviderApiKeyWithRegistryFallback).toHaveBeenCalledWith(
      expect.anything(),
      'user_1',
      'ip_nexus_text',
    )
    expect(langchainMocks.constructorArgs).toHaveBeenCalledWith(expect.objectContaining({
      apiKey: 'sk-test',
      model: 'gpt-4o-mini',
      configuration: { baseURL: 'https://api.openai.com/v1' },
    }))
    expect(langchainMocks.invoke).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({
        content: expect.stringContaining('Translate from en to zh'),
      }),
      expect.objectContaining({
        content: 'hello',
      }),
    ]))
    expect(storeMocks.createAudit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      userId: 'user_1',
      providerId: 'ip_nexus_text',
      providerType: 'openai',
      model: 'gpt-4o-mini',
      success: true,
      metadata: expect.objectContaining({
        source: 'core-app',
        stage: 'capability:text.translate',
        sessionId: 'session_1',
      }),
    }))
    expect(JSON.stringify(storeMocks.createAudit.mock.calls[0]?.[1])).not.toContain('hello')
    expect(JSON.stringify(storeMocks.createAudit.mock.calls[0]?.[1])).not.toContain('translated text')
    expect(creditStoreMocks.consumeCredits).toHaveBeenCalledWith(
      expect.anything(),
      'user_1',
      7,
      'intelligence-invoke',
      expect.objectContaining({
        capabilityId: 'text.translate',
        providerId: 'ip_nexus_text',
        providerName: 'Nexus OpenAI',
        providerType: 'openai',
        model: 'gpt-4o-mini',
        tokens: 7,
        promptTokens: 3,
        completionTokens: 4,
        source: 'core-app',
      }),
    )
    const creditMetadata = JSON.stringify(creditStoreMocks.consumeCredits.mock.calls[0]?.[4])
    expect(creditMetadata).not.toContain('hello')
    expect(creditMetadata).not.toContain('translated text')
    expect(result).toMatchObject({
      capabilityId: 'text.translate',
      result: 'translated text',
      usage: { promptTokens: 3, completionTokens: 4, totalTokens: 7 },
      model: 'gpt-4o-mini',
      provider: 'ip_nexus_text',
      metadata: {
        nexus: true,
        providerName: 'Nexus OpenAI',
        providerType: 'openai',
        fallbackCount: 0,
        retryCount: 0,
        attemptedProviders: ['ip_nexus_text'],
      },
    })
  })

  it('totalTokens 为 0 时不扣 credits', async () => {
    langchainMocks.invoke.mockResolvedValueOnce({
      content: 'ok',
      usage_metadata: {
        input_tokens: 0,
        output_tokens: 0,
        total_tokens: 0,
      },
    })

    await invokeIntelligenceCapability({} as any, 'user_1', {
      capabilityId: 'text.chat',
      payload: {
        messages: [{ role: 'user', content: 'hello' }],
      },
    })

    expect(creditStoreMocks.consumeCredits).not.toHaveBeenCalled()
  })

  it('provider 调用失败时不扣 credits', async () => {
    langchainMocks.invoke.mockRejectedValue(new Error('provider failed'))

    await expect(invokeIntelligenceCapability({} as any, 'user_1', {
      capabilityId: 'text.chat',
      payload: {
        messages: [{ role: 'user', content: 'hello' }],
      },
    })).rejects.toThrow('provider failed')

    expect(creditStoreMocks.consumeCredits).not.toHaveBeenCalled()
  })

  it('credits 不足时返回明确的 402 错误', async () => {
    creditStoreMocks.consumeCredits.mockRejectedValueOnce(new Error('User credits exceeded.'))

    await expect(invokeIntelligenceCapability({} as any, 'user_1', {
      capabilityId: 'text.chat',
      payload: {
        messages: [{ role: 'user', content: 'hello' }],
      },
    })).rejects.toMatchObject({
      statusCode: 402,
      statusMessage: 'CREDITS_EXCEEDED',
      data: {
        code: 'CREDITS_EXCEEDED',
        reason: 'User credits exceeded.',
      },
    })
  })
})
