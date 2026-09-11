import type { IntelligenceProviderRecord } from './intelligenceStore'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_CREDIT_PRICING, selectCreditPricingRule } from './creditPricingStore'
import {
  listPlatformGovernanceEvents,
  recordPlatformGovernanceEvent,
  upsertPlatformGovernanceConfig,
} from './platformGovernanceStore'
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
  releaseConsumedCredits: vi.fn(),
}))

const pricingMocks = vi.hoisted(() => ({
  resolveCreditPricingRule: vi.fn(),
}))

const usageLedgerMocks = vi.hoisted(() => ({
  recordProviderUsageLedger: vi.fn(),
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
vi.mock('./providerUsageLedgerStore', () => usageLedgerMocks)

// The price list itself is a database read; the rule it resolves is not. Keeping the real
// pure lookup means these tests assert the shipped prices rather than a hand-rolled table.
vi.mock('./creditPricingStore', async () => {
  const actual = await vi.importActual<typeof import('./creditPricingStore')>('./creditPricingStore')
  return {
    ...actual,
    resolveCreditPricingRule: pricingMocks.resolveCreditPricingRule,
  }
})

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

function h3Event(path = '/test/intelligence-invoke') {
  return {
    node: {
      req: {
        headers: {
          'user-agent': 'vitest',
        },
      },
    },
    context: {},
    path,
  } as any
}

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

function ledgerEntry(amount: number, reason: string) {
  return {
    ledgerId: `ledger_${reason}_${amount}`,
    teamId: 'team_user_1',
    userId: 'user_1',
    amount,
    reason,
    createdAt: '2026-05-12T00:00:00.000Z',
    metadata: {},
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
    pricingMocks.resolveCreditPricingRule.mockImplementation(
      async (_event: unknown, capability: string) =>
        selectCreditPricingRule(capability, DEFAULT_CREDIT_PRICING),
    )
    // consumeCredits reports back what it actually moved, so the reserve the service
    // holds is the amount it asked for; releaseConsumedCredits mirrors it as a refund.
    creditStoreMocks.consumeCredits.mockImplementation(
      async (_event: unknown, _userId: string, amount: number, reason: string) =>
        ledgerEntry(amount, reason),
    )
    creditStoreMocks.releaseConsumedCredits.mockImplementation(
      async (_event: unknown, _userId: string, amount: number, reason: string) =>
        ledgerEntry(amount, reason),
    )
    usageLedgerMocks.recordProviderUsageLedger.mockResolvedValue([{ id: 'provider_usage_1' }])
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
    const result = await invokeIntelligenceCapability(h3Event(), 'user_1', {
      capabilityId: 'text.translate',
      payload: {
        text: 'hello',
        sourceLang: 'en',
        targetLang: 'zh',
      },
      options: {
        modelPreference: ['gpt-4o-mini'],
        metadata: {
          sessionId: 'session_1',
          caller: 'workflow.use-model',
          workflowId: 'workflow_1',
          workflowName: 'Meeting Summary',
          workflowRunId: 'run_1',
          workflowStepId: 'step_1',
        },
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

    // The hold is taken before the provider is called: provider cost must not be spent
    // before the account is known to afford the call.
    expect(creditStoreMocks.consumeCredits).toHaveBeenCalledTimes(1)
    expect(creditStoreMocks.consumeCredits).toHaveBeenCalledWith(
      expect.anything(),
      'user_1',
      512,
      'intelligence-invoke-reserve',
      expect.objectContaining({
        capabilityId: 'text.translate',
        unit: '1k_tokens',
        reservedCredits: 512,
        estimatedUsage: { tokens: 512 },
        source: 'core-app',
        caller: 'workflow.use-model',
        sessionId: 'session_1',
      }),
      { idempotencyKey: expect.stringMatching(/^intelligence-invoke-reserve:reserve_/) },
    )
    expect(creditStoreMocks.consumeCredits.mock.invocationCallOrder[0])
      .toBeLessThan(langchainMocks.invoke.mock.invocationCallOrder[0]!)

    // The provider reported 7 tokens against a 512-credit hold, so 7 is the charge and
    // the 505 the hold over-covered goes back.
    expect(creditStoreMocks.releaseConsumedCredits).toHaveBeenCalledTimes(1)
    expect(creditStoreMocks.releaseConsumedCredits).toHaveBeenCalledWith(
      expect.anything(),
      'user_1',
      505,
      'intelligence-invoke-release',
      expect.objectContaining({
        traceId: result.traceId,
        capabilityId: 'text.translate',
        reservedCredits: 512,
        releasedCredits: 505,
        chargedCredits: 7,
      }),
      { idempotencyKey: `intelligence-invoke-release:${result.traceId}` },
    )

    const creditMetadata = JSON.stringify(creditStoreMocks.consumeCredits.mock.calls[0]?.[4])
    expect(creditMetadata).not.toContain('hello')
    expect(creditMetadata).not.toContain('translated text')
    expect(usageLedgerMocks.recordProviderUsageLedger).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        runId: 'intelligence_invoke_' + result.traceId,
        sceneId: 'nexus.intelligence.invoke',
        status: 'completed',
        requestedCapabilities: ['text.translate'],
        usage: [
          expect.objectContaining({
            unit: '1k_tokens',
            quantity: 7,
            billable: true,
            providerId: 'ip_nexus_text',
            capability: 'text.translate',
            providerUsageRef: result.traceId,
          }),
        ],
        output: null,
      }),
    )
    const providerLedgerPayload = JSON.stringify(
      usageLedgerMocks.recordProviderUsageLedger.mock.calls[0]?.[1],
    )
    expect(providerLedgerPayload).not.toContain('hello')
    expect(providerLedgerPayload).not.toContain('translated text')
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
        source: 'core-app',
        caller: 'workflow.use-model',
        sessionId: 'session_1',
        workflowId: 'workflow_1',
        workflowName: 'Meeting Summary',
        workflowRunId: 'run_1',
        workflowStepId: 'step_1',
        billing: {
          ledgerId: 'ledger_intelligence-invoke-reserve_512',
          chargedCredits: 7,
          unit: '1k_tokens',
          quantity: 7,
          reservedCredits: 512,
          reserveId: expect.any(String),
          billable: true,
          reason: 'intelligence-invoke',
        },
        providerUsageLedgerIds: ['provider_usage_1'],
      },
    })
  })

  it('accepts chat.completion alias through shared capability normalizer', async () => {
    await invokeIntelligenceCapability(h3Event(), 'user_1', {
      capabilityId: 'chat.completion',
      payload: {
        input: 'hello from alias',
      },
    })

    expect(langchainMocks.invoke).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({
        content: 'hello from alias',
      }),
    ]))
    expect(storeMocks.createAudit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      metadata: expect.objectContaining({
        stage: 'capability:text.chat',
      }),
    }))
  })

  it('routes direct invoke through shared provider routing and capability filters', async () => {
    providerBridgeMocks.listIntelligenceProvidersWithRegistryMirrors.mockResolvedValueOnce([
      provider({
        id: 'ip_chat_only',
        priority: 1,
        capabilities: ['text.chat'],
      }),
      provider({
        id: 'ip_translate',
        priority: 2,
        capabilities: ['text.translate'],
        defaultModel: 'gpt-4o',
        models: ['gpt-4o'],
      }),
    ])

    await invokeIntelligenceCapability(h3Event(), 'user_1', {
      capabilityId: 'text.translate',
      payload: {
        text: 'hello',
        targetLang: 'zh',
      },
      options: {
        modelPreference: ['gpt-4o'],
      },
    })

    expect(providerBridgeMocks.getIntelligenceProviderApiKeyWithRegistryFallback).toHaveBeenCalledWith(
      expect.anything(),
      'user_1',
      'ip_translate',
    )
    expect(langchainMocks.constructorArgs).toHaveBeenCalledWith(expect.objectContaining({
      model: 'gpt-4o',
    }))
  })

  it('totalTokens 为 0 时预扣全额释放且不计费', async () => {
    langchainMocks.invoke.mockResolvedValueOnce({
      content: 'ok',
      usage_metadata: {
        input_tokens: 0,
        output_tokens: 0,
        total_tokens: 0,
      },
    })

    const result = await invokeIntelligenceCapability(h3Event(), 'user_1', {
      capabilityId: 'text.chat',
      payload: {
        messages: [{ role: 'user', content: 'hello' }],
      },
    })

    expect(creditStoreMocks.consumeCredits).toHaveBeenCalledTimes(1)
    expect(creditStoreMocks.releaseConsumedCredits).toHaveBeenCalledWith(
      expect.anything(),
      'user_1',
      512,
      'intelligence-invoke-release',
      expect.objectContaining({
        traceId: result.traceId,
        reservedCredits: 512,
        releasedCredits: 512,
        traceOutcome: 'unmetered',
      }),
      { idempotencyKey: `intelligence-invoke-release:${result.traceId}` },
    )
    expect(result.metadata.billing).toMatchObject({
      chargedCredits: 0,
      unit: '1k_tokens',
      quantity: 0,
      reservedCredits: 512,
      billable: false,
      reason: 'intelligence-invoke',
    })
    expect(usageLedgerMocks.recordProviderUsageLedger).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        usage: [
          expect.objectContaining({
            quantity: 0,
            billable: false,
          }),
        ],
      }),
    )
  })

  it('provider 调用失败时释放全部预扣且错误原样抛出', async () => {
    langchainMocks.invoke.mockRejectedValue(new Error('provider failed'))

    await expect(invokeIntelligenceCapability(h3Event(), 'user_1', {
      capabilityId: 'text.chat',
      payload: {
        messages: [{ role: 'user', content: 'hello' }],
      },
    })).rejects.toThrow('provider failed')

    expect(creditStoreMocks.releaseConsumedCredits).toHaveBeenCalledTimes(1)
    expect(creditStoreMocks.releaseConsumedCredits).toHaveBeenCalledWith(
      expect.anything(),
      'user_1',
      512,
      'intelligence-invoke-release',
      expect.objectContaining({
        reserveId: expect.stringMatching(/^reserve_/),
        reservedCredits: 512,
        releasedCredits: 512,
        traceOutcome: 'dispatch-failed',
      }),
      { idempotencyKey: expect.stringMatching(/^intelligence-invoke-release:reserve_/) },
    )
    expect(storeMocks.createAudit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      success: false,
      metadata: expect.objectContaining({
        errorCode: 'UNKNOWN',
      }),
    }))
  })

  it('provider 报告超过预扣的用量时补扣差额并仍返回结果', async () => {
    langchainMocks.invoke.mockResolvedValueOnce({
      content: 'long answer',
      usage_metadata: {
        input_tokens: 100,
        output_tokens: 600,
        total_tokens: 700,
      },
    })

    const result = await invokeIntelligenceCapability(h3Event(), 'user_1', {
      capabilityId: 'text.chat',
      payload: {
        messages: [{ role: 'user', content: 'hello' }],
      },
    })

    expect(creditStoreMocks.consumeCredits).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      'user_1',
      512,
      'intelligence-invoke-reserve',
      expect.anything(),
      { idempotencyKey: expect.stringMatching(/^intelligence-invoke-reserve:reserve_/) },
    )
    expect(creditStoreMocks.consumeCredits).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      'user_1',
      188,
      'intelligence-invoke-settle',
      expect.objectContaining({
        capabilityId: 'text.chat',
        traceId: result.traceId,
        tokens: 700,
        promptTokens: 100,
        completionTokens: 600,
      }),
      { idempotencyKey: `intelligence-invoke-settle:${result.traceId}` },
    )
    expect(creditStoreMocks.releaseConsumedCredits).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      result: 'long answer',
      usage: { promptTokens: 100, completionTokens: 600, totalTokens: 700 },
      metadata: {
        billing: {
          ledgerId: 'ledger_intelligence-invoke-settle_188',
          chargedCredits: 700,
          unit: '1k_tokens',
          quantity: 700,
          reservedCredits: 512,
          reserveId: expect.any(String),
          billable: true,
          reason: 'intelligence-invoke',
        },
      },
    })
  })

  it('补扣差额失败不影响已经返回的结果', async () => {
    langchainMocks.invoke.mockResolvedValueOnce({
      content: 'long answer',
      usage_metadata: {
        input_tokens: 100,
        output_tokens: 600,
        total_tokens: 700,
      },
    })
    creditStoreMocks.consumeCredits
      .mockResolvedValueOnce(ledgerEntry(512, 'intelligence-invoke-reserve'))
      .mockRejectedValueOnce(new Error('User credits exceeded.'))

    const result = await invokeIntelligenceCapability(h3Event(), 'user_1', {
      capabilityId: 'text.chat',
      payload: {
        messages: [{ role: 'user', content: 'hello' }],
      },
    })

    expect(result).toMatchObject({
      result: 'long answer',
      metadata: {
        billing: {
          ledgerId: 'ledger_intelligence-invoke-reserve_512',
          chargedCredits: 700,
          reservedCredits: 512,
          billable: true,
        },
      },
    })
  })

  it('价格表不售卖 provider 上报的单位时保留预扣而不是免费放行', async () => {
    pricingMocks.resolveCreditPricingRule.mockImplementationOnce(
      async () => selectCreditPricingRule('vision.ocr', DEFAULT_CREDIT_PRICING),
    )
    langchainMocks.invoke.mockResolvedValueOnce({
      content: 'ok',
      usage_metadata: {
        input_tokens: 2,
        output_tokens: 3,
        total_tokens: 5,
      },
    })

    const result = await invokeIntelligenceCapability(h3Event(), 'user_1', {
      capabilityId: 'text.chat',
      payload: {
        messages: [{ role: 'user', content: 'hello' }],
      },
    })

    expect(creditStoreMocks.consumeCredits).toHaveBeenCalledTimes(1)
    expect(creditStoreMocks.consumeCredits).toHaveBeenCalledWith(
      expect.anything(),
      'user_1',
      10,
      'intelligence-invoke-reserve',
      expect.objectContaining({
        capabilityId: 'text.chat',
        unit: 'image',
        reservedCredits: 10,
      }),
      { idempotencyKey: expect.stringMatching(/^intelligence-invoke-reserve:reserve_/) },
    )
    expect(creditStoreMocks.releaseConsumedCredits).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      result: 'ok',
      metadata: {
        billing: {
          ledgerId: 'ledger_intelligence-invoke-reserve_10',
          chargedCredits: 10,
          unit: 'image',
          quantity: 0,
          reservedCredits: 10,
          billable: true,
          reason: 'intelligence-invoke',
        },
      },
    })
  })

  it('direct invoke 在进入模型前按 Provider Registry governance id 拦截 provider request quota', async () => {
    const registryProviderId = `registry_provider_${crypto.randomUUID()}`
    const event = h3Event(`/test/${registryProviderId}`)
    providerBridgeMocks.listIntelligenceProvidersWithRegistryMirrors.mockResolvedValueOnce([
      provider({
        metadata: {
          providerRegistryId: registryProviderId,
        },
      }),
    ])
    await upsertPlatformGovernanceConfig(event, {
      configType: 'intelligence_provider_quota',
      name: 'Blocked direct invoke quota',
      targetId: registryProviderId,
      limits: {
        maxRequests: 0,
        windowDays: 30,
      },
    }, 'admin')

    await expect(invokeIntelligenceCapability(event, 'user_1', {
      capabilityId: 'text.chat',
      payload: {
        messages: [{ role: 'user', content: 'hello' }],
      },
    })).rejects.toMatchObject({
      statusCode: 429,
      data: {
        code: 'INTELLIGENCE_PROVIDER_REQUEST_QUOTA_EXCEEDED',
        providerId: registryProviderId,
      },
    })

    expect(langchainMocks.invoke).not.toHaveBeenCalled()
    expect(creditStoreMocks.consumeCredits).toHaveBeenCalledWith(
      expect.anything(),
      'user_1',
      512,
      'intelligence-invoke-reserve',
      expect.anything(),
      { idempotencyKey: expect.stringMatching(/^intelligence-invoke-reserve:reserve_/) },
    )
    expect(creditStoreMocks.releaseConsumedCredits).toHaveBeenCalledWith(
      expect.anything(),
      'user_1',
      512,
      'intelligence-invoke-release',
      expect.objectContaining({
        reservedCredits: 512,
        releasedCredits: 512,
        traceOutcome: 'dispatch-failed',
      }),
      { idempotencyKey: expect.stringMatching(/^intelligence-invoke-release:reserve_/) },
    )
    expect(usageLedgerMocks.recordProviderUsageLedger).not.toHaveBeenCalled()
    expect(storeMocks.createAudit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      status: 429,
      success: false,
      metadata: expect.objectContaining({
        errorCode: 'QUOTA_EXHAUSTED',
        retryable: false,
        willRetry: false,
      }),
    }))
    await expect(listPlatformGovernanceEvents(event, {
      scope: 'intelligence',
      action: 'provider.request',
      resourceType: 'provider',
      resourceId: registryProviderId,
      limit: 10,
    })).resolves.toHaveLength(0)
  })

  it('direct invoke 按 capability channel fail-closed 拦截耗尽的 provider quota', async () => {
    const registryProviderId = `registry_provider_channel_${crypto.randomUUID()}`
    const event = h3Event(`/test/${registryProviderId}`)
    providerBridgeMocks.listIntelligenceProvidersWithRegistryMirrors.mockResolvedValueOnce([
      provider({
        metadata: {
          providerRegistryId: registryProviderId,
        },
      }),
    ])
    await upsertPlatformGovernanceConfig(event, {
      configType: 'intelligence_provider_quota',
      name: 'Blocked direct invoke text chat quota',
      targetId: registryProviderId,
      channel: 'text.chat',
      limits: {
        maxRequests: 1,
        windowDays: 30,
      },
    }, 'admin')
    await upsertPlatformGovernanceConfig(event, {
      configType: 'intelligence_provider_quota',
      name: 'Open direct invoke text translate quota',
      targetId: registryProviderId,
      channel: 'text.translate',
      limits: {
        maxRequests: 10,
        windowDays: 30,
      },
    }, 'admin')
    await recordPlatformGovernanceEvent(event, {
      scope: 'intelligence',
      action: 'provider.request',
      resourceType: 'provider',
      resourceId: registryProviderId,
      channel: 'text.chat',
      unit: 'request',
      quantity: 1,
    })

    await expect(invokeIntelligenceCapability(event, 'user_1', {
      capabilityId: 'text.chat',
      payload: {
        messages: [{ role: 'user', content: 'hello' }],
      },
    })).rejects.toMatchObject({
      statusCode: 429,
      data: {
        code: 'INTELLIGENCE_PROVIDER_REQUEST_QUOTA_EXCEEDED',
        providerId: registryProviderId,
        channel: 'text.chat',
      },
    })

    expect(langchainMocks.invoke).not.toHaveBeenCalled()
    expect(creditStoreMocks.consumeCredits).toHaveBeenCalledWith(
      expect.anything(),
      'user_1',
      512,
      'intelligence-invoke-reserve',
      expect.anything(),
      { idempotencyKey: expect.stringMatching(/^intelligence-invoke-reserve:reserve_/) },
    )
    expect(creditStoreMocks.releaseConsumedCredits).toHaveBeenCalledWith(
      expect.anything(),
      'user_1',
      512,
      'intelligence-invoke-release',
      expect.objectContaining({
        reservedCredits: 512,
        releasedCredits: 512,
        traceOutcome: 'dispatch-failed',
      }),
      { idempotencyKey: expect.stringMatching(/^intelligence-invoke-release:reserve_/) },
    )
    expect(usageLedgerMocks.recordProviderUsageLedger).not.toHaveBeenCalled()
    const requestEvents = await listPlatformGovernanceEvents(event, {
      scope: 'intelligence',
      action: 'provider.request',
      resourceType: 'provider',
      resourceId: registryProviderId,
      limit: 10,
    })
    expect(requestEvents.filter(item => item.channel === 'text.chat')).toHaveLength(1)
    expect(requestEvents.filter(item => item.channel === 'text.translate')).toHaveLength(0)
    const blockedEvents = await listPlatformGovernanceEvents(event, {
      scope: 'intelligence',
      action: 'provider.quota_blocked',
      resourceType: 'provider',
      resourceId: registryProviderId,
      limit: 10,
    })
    expect(blockedEvents.filter(item => item.channel === 'text.chat')).toHaveLength(1)
    expect(blockedEvents[0]?.metadata).toMatchObject({
      evidenceSource: 'live',
      providerId: registryProviderId,
      channel: 'text.chat',
      source: 'core-app',
      stage: 'capability:text.chat',
      reason: 'INTELLIGENCE_PROVIDER_REQUEST_QUOTA_EXCEEDED',
      requestBlocked: true,
    })
  })

  it('credits 不足时返回明确的 402 错误且不调用模型', async () => {
    creditStoreMocks.consumeCredits.mockRejectedValueOnce(new Error('User credits exceeded.'))

    await expect(invokeIntelligenceCapability(h3Event(), 'user_1', {
      capabilityId: 'text.chat',
      payload: {
        messages: [{ role: 'user', content: 'hello' }],
      },
    })).rejects.toMatchObject({
      statusCode: 402,
      statusMessage: 'CREDITS_EXCEEDED',
      data: {
        code: 'CREDITS_EXCEEDED',
        capabilityId: 'text.chat',
        reason: 'User credits exceeded.',
      },
    })

    expect(langchainMocks.invoke).not.toHaveBeenCalled()
    expect(creditStoreMocks.releaseConsumedCredits).not.toHaveBeenCalled()
  })
})
