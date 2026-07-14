import type { IntelligenceProviderRecord } from './intelligenceStore'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { invokeIntelligenceCapability, streamIntelligenceCapability } from './tuffIntelligenceLabService'
import {
  clearIntelligenceProviderAdaptersForTest,
  registerIntelligenceProviderAdapterForTest,
  registerIntelligenceProviderStreamAdapterForTest,
} from './tuffIntelligenceProviderAdapters'

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
const usageLedgerMocks = vi.hoisted(() => ({
  recordProviderUsageLedger: vi.fn(),
}))
const langchainMocks = vi.hoisted(() => ({
  invoke: vi.fn(),
}))

vi.mock('./intelligenceStore', async () => {
  const actual = await vi.importActual<typeof import('./intelligenceStore')>('./intelligenceStore')
  return { ...actual, createAudit: storeMocks.createAudit, getSettings: storeMocks.getSettings }
})
vi.mock('./intelligenceProviderRegistryBridge', () => providerBridgeMocks)
vi.mock('./creditsStore', () => creditStoreMocks)
vi.mock('./providerUsageLedgerStore', () => usageLedgerMocks)
vi.mock('@langchain/openai', () => ({
  ChatOpenAI: class {
    invoke(messages: unknown) { return langchainMocks.invoke(messages) }
  },
}))

function event() {
  return { node: { req: { headers: { 'user-agent': 'vitest' } } }, context: {}, path: '/test' } as any
}

function provider(overrides: Partial<IntelligenceProviderRecord> = {}): IntelligenceProviderRecord {
  return {
    id: 'ip_adapter',
    userId: 'user_1',
    type: 'openai',
    name: 'Adapter OpenAI',
    enabled: true,
    hasApiKey: true,
    baseUrl: 'https://api.openai.com/v1',
    models: ['gpt-4o-mini'],
    defaultModel: 'gpt-4o-mini',
    instructions: null,
    timeout: 30000,
    priority: 1,
    rateLimit: null,
    capabilities: ['text.chat'],
    metadata: null,
    createdAt: '2026-05-12T00:00:00.000Z',
    updatedAt: '2026-05-12T00:00:00.000Z',
    ...overrides,
  }
}

describe('Nexus provider adapter boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearIntelligenceProviderAdaptersForTest()
    storeMocks.getSettings.mockResolvedValue({ defaultStrategy: 'priority', enableAudit: true })
    providerBridgeMocks.getIntelligenceProviderApiKeyWithRegistryFallback.mockResolvedValue('sk-test')
    providerBridgeMocks.listIntelligenceProvidersWithRegistryMirrors.mockResolvedValue([provider()])
    creditStoreMocks.consumeCredits.mockResolvedValue({
      ledgerId: 'credit_1',
      teamId: 'team_user_1',
      userId: 'user_1',
      amount: 3,
      reason: 'intelligence-invoke',
      createdAt: '2026-05-12T00:00:00.000Z',
      metadata: {},
    })
    usageLedgerMocks.recordProviderUsageLedger.mockResolvedValue([{ id: 'usage_1' }])
  })

  it('invokes direct chat through a swappable provider adapter', async () => {
    const adapter = vi.fn(async ({ context, messages }) => ({
      content: `adapter:${messages[0]?.content}`,
      model: context.model,
      traceId: 'trace_adapter_1',
      endpoint: 'adapter:openai:chat',
      status: 200,
      latency: 12,
      usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
    }))
    registerIntelligenceProviderAdapterForTest('openai', adapter)

    const result = await invokeIntelligenceCapability(event(), 'user_1', {
      capabilityId: 'text.chat',
      payload: { messages: [{ role: 'user', content: 'hello' }] },
    })

    expect(adapter).toHaveBeenCalledWith(expect.objectContaining({
      context: expect.objectContaining({ model: 'gpt-4o-mini' }),
      messages: [{ role: 'user', content: 'hello' }],
    }))
    expect(langchainMocks.invoke).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      result: 'adapter:hello',
      traceId: 'trace_adapter_1',
      metadata: { providerUsageLedgerIds: ['usage_1'] },
    })
    expect(creditStoreMocks.consumeCredits).toHaveBeenCalledWith(
      expect.anything(),
      'user_1',
      3,
      'intelligence-invoke',
      expect.objectContaining({ providerId: 'ip_adapter' }),
    )
  })

  it('forwards ordered provider deltas and finalizes the same governed, billed, audited result', async () => {
    registerIntelligenceProviderStreamAdapterForTest('openai', async function* ({ context }) {
      yield {
        delta: 'Hel',
        done: false,
        model: context.model,
        traceId: 'trace_stream_1',
        endpoint: 'adapter:openai:stream',
        status: 200,
        latency: 12,
      }
      yield {
        delta: 'lo',
        done: false,
        model: context.model,
        traceId: 'trace_stream_1',
        endpoint: 'adapter:openai:stream',
        status: 200,
        latency: 13,
      }
      yield {
        delta: '',
        done: true,
        model: context.model,
        traceId: 'trace_stream_1',
        endpoint: 'adapter:openai:stream',
        status: 200,
        latency: 14,
        usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
      }
    })
    const onDelta = vi.fn()

    const result = await streamIntelligenceCapability(event(), 'user_1', {
      capabilityId: 'text.chat',
      payload: { messages: [{ role: 'user', content: 'hello' }] },
    }, { onDelta })

    expect(onDelta).toHaveBeenNthCalledWith(1, 'Hel', expect.objectContaining({
      traceId: 'trace_stream_1',
      provider: 'ip_adapter',
      model: 'gpt-4o-mini',
      latency: 12,
    }))
    expect(onDelta).toHaveBeenNthCalledWith(2, 'lo', expect.objectContaining({
      traceId: 'trace_stream_1',
      provider: 'ip_adapter',
      model: 'gpt-4o-mini',
      latency: 13,
    }))
    expect(onDelta).toHaveBeenCalledTimes(2)
    expect(result).toMatchObject({
      capabilityId: 'text.chat',
      result: 'Hello',
      traceId: 'trace_stream_1',
      model: 'gpt-4o-mini',
      provider: 'ip_adapter',
      metadata: {
        fallbackCount: 0,
        attemptedProviders: ['ip_adapter'],
        billing: {
          ledgerId: 'credit_1',
          chargedCredits: 3,
          unit: 'token',
          billable: true,
        },
        providerUsageLedgerIds: ['usage_1'],
      },
    })
    expect(storeMocks.createAudit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      providerId: 'ip_adapter',
      success: true,
      metadata: expect.objectContaining({ stage: 'capability:text.chat' }),
    }))
    expect(creditStoreMocks.consumeCredits).toHaveBeenCalledWith(
      expect.anything(),
      'user_1',
      3,
      'intelligence-invoke',
      expect.objectContaining({ providerId: 'ip_adapter', tokens: 3 }),
    )
    expect(usageLedgerMocks.recordProviderUsageLedger).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        runId: 'intelligence_invoke_trace_stream_1',
        status: 'completed',
      }),
    )
  })

  it('falls back only when the selected provider fails before yielding a delta', async () => {
    providerBridgeMocks.listIntelligenceProvidersWithRegistryMirrors.mockResolvedValueOnce([
      provider({ id: 'ip_primary', priority: 1 }),
      provider({ id: 'ip_fallback', priority: 2 }),
    ])
    registerIntelligenceProviderStreamAdapterForTest('openai', async function* ({ context }) {
      if (context.provider.id === 'ip_primary')
        throw new Error('primary temporarily unavailable')
      yield {
        delta: 'recovered',
        done: false,
        model: context.model,
        traceId: 'trace_fallback_1',
        endpoint: 'adapter:openai:stream',
        latency: 9,
      }
      yield {
        delta: '',
        done: true,
        model: context.model,
        traceId: 'trace_fallback_1',
        endpoint: 'adapter:openai:stream',
        latency: 10,
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
      }
    })
    const onDelta = vi.fn()

    const result = await streamIntelligenceCapability(event(), 'user_1', {
      capabilityId: 'text.chat',
      payload: { messages: [{ role: 'user', content: 'hello' }] },
    }, { onDelta })

    expect(onDelta).toHaveBeenCalledWith('recovered', expect.objectContaining({
      provider: 'ip_fallback',
      traceId: 'trace_fallback_1',
    }))
    expect(result).toMatchObject({
      result: 'recovered',
      provider: 'ip_fallback',
      metadata: {
        fallbackCount: 1,
        attemptedProviders: ['ip_primary', 'ip_fallback'],
      },
    })
  })

  it('fails after the first delta rather than replaying output through a fallback provider', async () => {
    providerBridgeMocks.listIntelligenceProvidersWithRegistryMirrors.mockResolvedValueOnce([
      provider({ id: 'ip_primary', priority: 1 }),
      provider({ id: 'ip_fallback', priority: 2 }),
    ])
    registerIntelligenceProviderStreamAdapterForTest('openai', async function* ({ context }) {
      if (context.provider.id === 'ip_primary') {
        yield {
          delta: 'partial',
          done: false,
          model: context.model,
          traceId: 'trace_partial_1',
          endpoint: 'adapter:openai:stream',
          latency: 8,
        }
        throw new Error('stream interrupted')
      }
      yield {
        delta: 'must-not-replay',
        done: false,
        model: context.model,
        traceId: 'trace_replay_1',
        endpoint: 'adapter:openai:stream',
        latency: 9,
      }
    })
    const onDelta = vi.fn()

    await expect(streamIntelligenceCapability(event(), 'user_1', {
      capabilityId: 'text.chat',
      payload: { messages: [{ role: 'user', content: 'hello' }] },
    }, { onDelta })).rejects.toThrow('stream interrupted')
    expect(onDelta).toHaveBeenCalledTimes(1)
    expect(onDelta).toHaveBeenCalledWith('partial', expect.objectContaining({
      provider: 'ip_primary',
      traceId: 'trace_partial_1',
    }))
  })
})
