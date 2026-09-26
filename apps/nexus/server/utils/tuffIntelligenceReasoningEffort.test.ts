import type { IntelligenceProviderRecord } from './intelligenceStore'
import type {
  IntelligenceProviderAdapterPayload,
  IntelligenceProviderAdapterStreamChunk,
} from './tuffIntelligenceProviderAdapters'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_CREDIT_PRICING, selectCreditPricingRule } from './creditPricingStore'
import { invokeIntelligenceCapability, streamIntelligenceCapability } from './tuffIntelligenceLabService'
import {
  clearIntelligenceProviderAdaptersForTest,
  registerIntelligenceProviderAdapterForTest,
  registerIntelligenceProviderStreamAdapterForTest,
} from './tuffIntelligenceProviderAdapters'

/**
 * Nexus's half of the composer's reasoning effort: the level the client forwards is resolved per
 * upstream context against the shared table, handed to the adapter as a plan, and reported back —
 * `applied` / `clamped` with the level sent, or an `unsupported-*` status saying nothing was sent.
 */

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

vi.mock('./intelligenceStore', async () => {
  const actual = await vi.importActual<typeof import('./intelligenceStore')>('./intelligenceStore')
  return { ...actual, createAudit: storeMocks.createAudit, getSettings: storeMocks.getSettings }
})
vi.mock('./intelligenceProviderRegistryBridge', () => providerBridgeMocks)
vi.mock('./creditsStore', async () => {
  const { MockCreditPricingD1Database } = await import('../../test/helpers/credit-pricing-test-utils')
  const pricingDb = new MockCreditPricingD1Database()
  return {
    consumeCredits: creditStoreMocks.consumeCredits,
    releaseConsumedCredits: creditStoreMocks.releaseConsumedCredits,
    requireDatabase: () => pricingDb,
  }
})
vi.mock('./providerUsageLedgerStore', () => usageLedgerMocks)
vi.mock('./creditPricingStore', async () => {
  const actual = await vi.importActual<typeof import('./creditPricingStore')>('./creditPricingStore')
  return { ...actual, resolveCreditPricingRule: pricingMocks.resolveCreditPricingRule }
})

function event() {
  return { node: { req: { headers: { 'user-agent': 'vitest' } } }, context: {}, path: '/test' } as any
}

function provider(overrides: Partial<IntelligenceProviderRecord> = {}): IntelligenceProviderRecord {
  return {
    id: 'ip_openai',
    userId: 'user_1',
    type: 'openai',
    name: 'OpenAI',
    enabled: true,
    hasApiKey: true,
    baseUrl: 'https://api.openai.com/v1',
    models: ['gpt-5.5'],
    defaultModel: 'gpt-5.5',
    instructions: null,
    timeout: 30000,
    priority: 1,
    rateLimit: null,
    capabilities: ['text.chat', 'text.translate'],
    metadata: null,
    createdAt: '2026-09-26T00:00:00.000Z',
    updatedAt: '2026-09-26T00:00:00.000Z',
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
    createdAt: '2026-09-26T00:00:00.000Z',
    metadata: {},
  }
}

/** Registers a stream adapter for `type` that records every payload and answers with one delta. */
function recordingStreamAdapter(type: string): IntelligenceProviderAdapterPayload[] {
  const payloads: IntelligenceProviderAdapterPayload[] = []
  registerIntelligenceProviderStreamAdapterForTest(type, async function* (payload): AsyncGenerator<IntelligenceProviderAdapterStreamChunk> {
    payloads.push(payload)
    yield {
      delta: 'ok',
      done: false,
      model: payload.context.model,
      traceId: 'trace_reasoning',
      endpoint: `adapter:${type}:stream`,
      latency: 5,
    }
    yield {
      delta: '',
      done: true,
      model: payload.context.model,
      traceId: 'trace_reasoning',
      endpoint: `adapter:${type}:stream`,
      latency: 6,
      usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
    }
  })
  return payloads
}

const chat = { messages: [{ role: 'user', content: 'hello' }] }

describe('Nexus reasoning effort', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearIntelligenceProviderAdaptersForTest()
    storeMocks.getSettings.mockResolvedValue({ defaultStrategy: 'priority', enableAudit: false })
    providerBridgeMocks.getIntelligenceProviderApiKeyWithRegistryFallback.mockResolvedValue('sk-test')
    providerBridgeMocks.listIntelligenceProvidersWithRegistryMirrors.mockResolvedValue([provider()])
    pricingMocks.resolveCreditPricingRule.mockImplementation(
      async (_event: unknown, capability: string) =>
        selectCreditPricingRule(capability, DEFAULT_CREDIT_PRICING),
    )
    creditStoreMocks.consumeCredits.mockImplementation(
      async (_event: unknown, _userId: string, amount: number, reason: string) =>
        ledgerEntry(amount, reason),
    )
    creditStoreMocks.releaseConsumedCredits.mockImplementation(
      async (_event: unknown, _userId: string, amount: number, reason: string) =>
        ledgerEntry(amount, reason),
    )
    usageLedgerMocks.recordProviderUsageLedger.mockResolvedValue([{ id: 'usage_1' }])
  })

  it('maps the level onto the upstream it routes to and reports it on start and in the result', async () => {
    const payloads = recordingStreamAdapter('openai')
    const onStart = vi.fn()

    const result = await streamIntelligenceCapability(event(), 'user_1', {
      capabilityId: 'text.chat',
      payload: chat,
      options: { reasoningEffort: 'max' },
    }, { onDelta: vi.fn(), onStart })

    const decision = { requested: 'max', applied: 'xhigh', status: 'applied' }
    expect(payloads[0]?.reasoning).toEqual({ wire: 'openai-reasoning-effort', decision })
    expect(onStart).toHaveBeenCalledWith(expect.objectContaining({ reasoningEffort: decision }))
    expect(result.metadata.reasoningEffort).toEqual(decision)
  })

  it('sends nothing to an upstream model that takes no effort, and says it was not applied', async () => {
    providerBridgeMocks.listIntelligenceProvidersWithRegistryMirrors.mockResolvedValue([
      provider({ models: ['gpt-4o-mini'], defaultModel: 'gpt-4o-mini' }),
    ])
    const payloads = recordingStreamAdapter('openai')

    const result = await streamIntelligenceCapability(event(), 'user_1', {
      capabilityId: 'text.chat',
      payload: chat,
      options: { reasoningEffort: 'high' },
    }, { onDelta: vi.fn() })

    expect(payloads[0]?.reasoning?.wire).toBeNull()
    expect(result.metadata.reasoningEffort).toEqual({
      requested: 'high',
      applied: null,
      status: 'unsupported-model',
    })
  })

  it('reports an upstream route that takes no effort at all', async () => {
    providerBridgeMocks.listIntelligenceProvidersWithRegistryMirrors.mockResolvedValue([
      provider({ id: 'ip_sf', type: 'siliconflow', models: ['deepseek-ai/DeepSeek-R1'], defaultModel: 'deepseek-ai/DeepSeek-R1' }),
    ])
    recordingStreamAdapter('siliconflow')

    const result = await streamIntelligenceCapability(event(), 'user_1', {
      capabilityId: 'text.chat',
      payload: chat,
      options: { reasoningEffort: 'high' },
    }, { onDelta: vi.fn() })

    expect(result.metadata.reasoningEffort).toEqual({
      requested: 'high',
      applied: null,
      status: 'unsupported-provider',
    })
  })

  it('re-plans for the fallback upstream that actually answers', async () => {
    providerBridgeMocks.listIntelligenceProvidersWithRegistryMirrors.mockResolvedValue([
      provider({ id: 'ip_primary', priority: 1 }),
      provider({ id: 'ip_claude', type: 'anthropic', priority: 2, models: ['claude-haiku-4-5'], defaultModel: 'claude-haiku-4-5' }),
    ])
    registerIntelligenceProviderStreamAdapterForTest('openai', async function* () {
      throw new Error('primary temporarily unavailable')
    })
    const claudePayloads = recordingStreamAdapter('anthropic')

    const result = await streamIntelligenceCapability(event(), 'user_1', {
      capabilityId: 'text.chat',
      payload: chat,
      options: { reasoningEffort: 'max' },
    }, { onDelta: vi.fn() })

    expect(claudePayloads[0]?.reasoning).toEqual({
      wire: 'anthropic-budget',
      decision: { requested: 'max', applied: 'high', status: 'applied' },
    })
    expect(result.provider).toBe('ip_claude')
    expect(result.metadata.reasoningEffort).toEqual({ requested: 'max', applied: 'high', status: 'applied' })
  })

  it('changes nothing on auto: no plan to the adapter, nothing in the result', async () => {
    const payloads = recordingStreamAdapter('openai')
    const onStart = vi.fn()

    const result = await streamIntelligenceCapability(event(), 'user_1', {
      capabilityId: 'text.chat',
      payload: chat,
    }, { onDelta: vi.fn(), onStart })

    expect(payloads[0]).not.toHaveProperty('reasoning')
    expect(onStart.mock.calls[0]?.[0]).not.toHaveProperty('reasoningEffort')
    expect(result.metadata).not.toHaveProperty('reasoningEffort')
  })

  it('drops an unknown level on the invoke route, and plans nothing for a non-chat capability', async () => {
    const adapter = vi.fn(async ({ context }: IntelligenceProviderAdapterPayload) => ({
      content: 'ok',
      model: context.model,
      traceId: 'trace_invoke',
      endpoint: 'adapter:openai:chat',
      status: 200,
      latency: 3,
      usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
    }))
    registerIntelligenceProviderAdapterForTest('openai', adapter)

    const chatResult = await invokeIntelligenceCapability(event(), 'user_1', {
      capabilityId: 'text.chat',
      payload: chat,
      options: { reasoningEffort: 'high' },
    })
    expect(adapter.mock.calls[0]?.[0].reasoning?.decision).toEqual({ requested: 'high', applied: 'high', status: 'applied' })
    expect(chatResult.metadata.reasoningEffort).toEqual({ requested: 'high', applied: 'high', status: 'applied' })

    // The invoke route takes its options raw; an unknown value must not become a plan.
    await invokeIntelligenceCapability(event(), 'user_1', {
      capabilityId: 'text.chat',
      payload: chat,
      options: { reasoningEffort: 'turbo' } as any,
    })
    expect(adapter.mock.calls[1]?.[0]).not.toHaveProperty('reasoning')

    const translateResult = await invokeIntelligenceCapability(event(), 'user_1', {
      capabilityId: 'text.translate',
      payload: { text: 'hello', targetLang: 'fr' },
      options: { reasoningEffort: 'high' },
    })
    expect(adapter.mock.calls[2]?.[0]).not.toHaveProperty('reasoning')
    expect(translateResult.metadata).not.toHaveProperty('reasoningEffort')
  })
})
