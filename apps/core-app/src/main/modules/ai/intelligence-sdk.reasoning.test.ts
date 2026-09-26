import type {
  IntelligenceInvokeOptions,
  IntelligenceProviderAdapter,
  IntelligenceProviderConfig,
  IntelligenceStreamChunk,
  IntelligenceStreamEvent
} from '@talex-touch/tuff-intelligence'
import type { IntelligenceAuditLogEntry } from './intelligence-audit-logger'
import type { ReasoningPlannedInvokeOptions } from './reasoning-effort-runtime'
import {
  IntelligenceCapabilityType,
  IntelligenceProviderType
} from '@talex-touch/tuff-intelligence'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import './intelligence-test-harness'
import { intelligenceAuditLogger } from './intelligence-audit-logger'
import { intelligenceCapabilityRegistry } from './intelligence-capability-registry'
import { setIntelligenceProviderManager, TuffIntelligenceSDK } from './intelligence-sdk'
import { createChatProvider, FakeProviderManager } from './intelligence-test-harness'

/**
 * The SDK's half of reasoning effort: one plan per provider attempt, carried to the provider, onto
 * the `start` / `end` events and the invoke result, and into the audit — and nothing at all on auto.
 */

const turn = { messages: [{ role: 'user' as const, content: 'hi' }] }

interface RecordingProvider {
  adapter: IntelligenceProviderAdapter
  streamOptions: IntelligenceInvokeOptions[]
  chatOptions: IntelligenceInvokeOptions[]
}

function provider(
  config: Partial<IntelligenceProviderConfig> & Pick<IntelligenceProviderConfig, 'id' | 'type'>,
  behaviour: {
    chunks?: IntelligenceStreamChunk[]
    failStream?: boolean
    result?: Record<string, unknown>
  } = {}
): RecordingProvider {
  const streamOptions: IntelligenceInvokeOptions[] = []
  const chatOptions: IntelligenceInvokeOptions[] = []
  const adapter = createChatProvider(
    { name: config.id, enabled: true, apiKey: 'test-only-key', ...config },
    vi.fn(async (_payload, options: IntelligenceInvokeOptions) => {
      chatOptions.push(options)
      return {
        result: 'ok',
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
        model: config.defaultModel ?? 'model',
        latency: 1,
        traceId: `trace-${config.id}`,
        provider: config.id,
        ...behaviour.result
      }
    })
  )
  adapter.chatStream = vi.fn(async function* (_payload, options: IntelligenceInvokeOptions) {
    streamOptions.push(options)
    if (behaviour.failStream) throw new Error('upstream unavailable')
    for (const chunk of behaviour.chunks ?? [{ delta: 'ok', done: false }]) yield chunk
    yield { delta: '', done: true }
  }) as IntelligenceProviderAdapter['chatStream']
  return { adapter, streamOptions, chatOptions }
}

function sdkFor(providers: RecordingProvider[], enableAudit = false): TuffIntelligenceSDK {
  setIntelligenceProviderManager(new FakeProviderManager(providers.map((entry) => entry.adapter)))
  return new TuffIntelligenceSDK({
    enableAudit,
    enableQuota: false,
    enableCache: false,
    capabilities: {
      'text.chat': {
        providers: providers.map((entry, index) => ({
          providerId: entry.adapter.getConfig().id,
          priority: index + 1
        }))
      },
      'text.translate': {
        providers: providers.map((entry, index) => ({
          providerId: entry.adapter.getConfig().id,
          priority: index + 1
        }))
      }
    }
  })
}

async function streamEvents(
  sdk: TuffIntelligenceSDK,
  options: IntelligenceInvokeOptions
): Promise<IntelligenceStreamEvent<string>[]> {
  const events: IntelligenceStreamEvent<string>[] = []
  for await (const event of sdk.stream<string>('text.chat', turn, options)) events.push(event)
  return events
}

function planOf(options: IntelligenceInvokeOptions | undefined) {
  return (options as ReasoningPlannedInvokeOptions | undefined)?.reasoningPlan
}

const ALL_PROVIDER_TYPES = [
  IntelligenceProviderType.OPENAI,
  IntelligenceProviderType.ANTHROPIC,
  IntelligenceProviderType.CUSTOM,
  IntelligenceProviderType.LOCAL
]

beforeEach(() => {
  intelligenceCapabilityRegistry.register({
    id: 'text.chat',
    type: IntelligenceCapabilityType.CHAT,
    name: 'Chat',
    description: 'reasoning effort',
    supportedProviders: ALL_PROVIDER_TYPES
  })
  intelligenceCapabilityRegistry.register({
    id: 'text.translate',
    type: IntelligenceCapabilityType.TRANSLATE,
    name: 'Translate',
    description: 'reasoning effort',
    supportedProviders: ALL_PROVIDER_TYPES
  })
})

afterEach(() => {
  intelligenceCapabilityRegistry.clear()
  vi.restoreAllMocks()
})

describe('stream', () => {
  it('sends nothing, and reports nothing, on auto', async () => {
    const openai = provider({
      id: 'openai',
      type: IntelligenceProviderType.OPENAI,
      defaultModel: 'gpt-5.5'
    })
    const events = await streamEvents(sdkFor([openai]), {})

    expect(planOf(openai.streamOptions[0])).toBeUndefined()
    expect(events.some((event) => 'reasoningEffort' in event)).toBe(false)
  })

  it('plans for the provider it picked and says so on start and end', async () => {
    const openai = provider({
      id: 'openai',
      type: IntelligenceProviderType.OPENAI,
      defaultModel: 'gpt-5.5'
    })
    const events = await streamEvents(sdkFor([openai]), { reasoningEffort: 'max' })

    const decision = { requested: 'max', applied: 'xhigh', status: 'applied' }
    expect(planOf(openai.streamOptions[0])).toEqual({ wire: 'openai-reasoning-effort', decision })
    expect(events.find((event) => event.type === 'start')?.reasoningEffort).toEqual(decision)
    expect(events.find((event) => event.type === 'end')?.reasoningEffort).toEqual(decision)
    // Deltas and usage stay as they were: the decision is not repeated on every event.
    expect(
      events.filter((event) => event.type === 'delta').every((event) => !event.reasoningEffort)
    ).toBe(true)
  })

  it("re-plans for a fallback provider instead of reusing the first one's plan", async () => {
    const openai = provider(
      { id: 'openai', type: IntelligenceProviderType.OPENAI, defaultModel: 'gpt-5.5', priority: 1 },
      { failStream: true }
    )
    const anthropic = provider({
      id: 'anthropic',
      type: IntelligenceProviderType.ANTHROPIC,
      defaultModel: 'claude-haiku-4-5',
      priority: 2
    })
    const events = await streamEvents(sdkFor([openai, anthropic]), { reasoningEffort: 'max' })

    expect(planOf(openai.streamOptions[0])?.wire).toBe('openai-reasoning-effort')
    expect(planOf(anthropic.streamOptions[0])).toEqual({
      wire: 'anthropic-budget',
      decision: { requested: 'max', applied: 'high', status: 'applied' }
    })
    // The first provider's `start` went out before it failed; `end` is the one that counts.
    expect(events.find((event) => event.type === 'end')?.reasoningEffort).toEqual({
      requested: 'max',
      applied: 'high',
      status: 'applied'
    })
  })

  it('reports that nothing was sent when the model takes no effort', async () => {
    const openai = provider({
      id: 'openai',
      type: IntelligenceProviderType.OPENAI,
      defaultModel: 'gpt-4o'
    })
    const events = await streamEvents(sdkFor([openai]), { reasoningEffort: 'high' })

    expect(events.find((event) => event.type === 'end')?.reasoningEffort).toEqual({
      requested: 'high',
      applied: null,
      status: 'unsupported-model'
    })
  })

  it("takes Nexus's own report over the forwarded placeholder", async () => {
    const reported = {
      requested: 'low' as const,
      applied: 'high' as const,
      status: 'clamped' as const
    }
    const nexus = provider(
      {
        id: 'tuff-nexus-default',
        type: IntelligenceProviderType.CUSTOM,
        defaultModel: 'gpt-4o-mini'
      },
      { chunks: [{ delta: 'ok', done: false, reasoningEffort: reported }] }
    )
    const events = await streamEvents(sdkFor([nexus]), { reasoningEffort: 'low' })

    expect(events.find((event) => event.type === 'start')?.reasoningEffort).toEqual({
      requested: 'low',
      applied: null,
      status: 'forwarded'
    })
    expect(events.find((event) => event.type === 'end')?.reasoningEffort).toEqual(reported)
  })

  it('does not let a provider overrule a decision main made itself', async () => {
    const openai = provider(
      { id: 'openai', type: IntelligenceProviderType.OPENAI, defaultModel: 'gpt-4o' },
      {
        chunks: [
          {
            delta: 'ok',
            done: false,
            reasoningEffort: { requested: 'high', applied: 'high', status: 'applied' }
          }
        ]
      }
    )
    const events = await streamEvents(sdkFor([openai]), { reasoningEffort: 'high' })

    expect(events.find((event) => event.type === 'end')?.reasoningEffort?.status).toBe(
      'unsupported-model'
    )
  })

  it('strips a plan a caller tried to hand the provider directly', async () => {
    const openai = provider({
      id: 'openai',
      type: IntelligenceProviderType.OPENAI,
      defaultModel: 'gpt-4o'
    })
    const forged = {
      reasoningPlan: {
        wire: 'openai-reasoning-effort',
        decision: { requested: 'max', applied: 'max', status: 'applied' }
      }
    } as unknown as IntelligenceInvokeOptions
    await streamEvents(sdkFor([openai]), forged)

    expect(planOf(openai.streamOptions[0])).toBeUndefined()
  })

  it('records requested, applied and status in the stream audit', async () => {
    const log = vi.spyOn(intelligenceAuditLogger, 'log').mockResolvedValue(undefined)
    const openai = provider({
      id: 'openai',
      type: IntelligenceProviderType.OPENAI,
      defaultModel: 'gpt-5.5'
    })
    await streamEvents(sdkFor([openai], true), {
      reasoningEffort: 'high',
      metadata: { operation: 'home-conversation' }
    })

    const entry = log.mock.calls[0]?.[0] as IntelligenceAuditLogEntry
    expect(entry.metadata).toEqual({
      operation: 'home-conversation',
      reasoningEffort: 'high',
      reasoningApplied: 'high',
      reasoningStatus: 'applied'
    })
  })
})

describe('invoke', () => {
  it('stamps the decision on a chat result and in its audit', async () => {
    const log = vi.spyOn(intelligenceAuditLogger, 'log').mockResolvedValue(undefined)
    const deepseekLike = provider({
      id: 'gateway',
      type: IntelligenceProviderType.CUSTOM,
      defaultModel: 'deepseek-v4-pro'
    })
    const result = await sdkFor([deepseekLike], true).invoke('text.chat', turn, {
      reasoningEffort: 'low'
    })

    const decision = { requested: 'low', applied: 'high', status: 'clamped' }
    expect(planOf(deepseekLike.chatOptions[0])).toEqual({ wire: 'deepseek-thinking', decision })
    expect(result.reasoningEffort).toEqual(decision)
    expect((log.mock.calls[0]?.[0] as IntelligenceAuditLogEntry).metadata).toMatchObject({
      reasoningEffort: 'low',
      reasoningApplied: 'high',
      reasoningStatus: 'clamped'
    })
  })

  it('plans nothing for a capability that is not a chat', async () => {
    const openai = provider({
      id: 'openai',
      type: IntelligenceProviderType.OPENAI,
      defaultModel: 'gpt-5.5'
    })
    openai.adapter.translate = vi.fn(async (_payload, options: IntelligenceInvokeOptions) => {
      openai.chatOptions.push(options)
      return {
        result: 'bonjour',
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
        model: 'gpt-5.5',
        latency: 1,
        traceId: 'trace-translate',
        provider: 'openai'
      }
    }) as IntelligenceProviderAdapter['translate']
    const result = await sdkFor([openai]).invoke(
      'text.translate',
      { text: 'hello', targetLang: 'fr' },
      { reasoningEffort: 'high' }
    )

    expect(planOf(openai.chatOptions[0])).toBeUndefined()
    expect(result).not.toHaveProperty('reasoningEffort')
  })

  it('re-plans the fallback provider of a non-streaming chat', async () => {
    const failing = provider({
      id: 'openai',
      type: IntelligenceProviderType.OPENAI,
      defaultModel: 'gpt-5.5',
      priority: 1
    })
    ;(failing.adapter.chat as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('down'))
    const anthropic = provider({
      id: 'anthropic',
      type: IntelligenceProviderType.ANTHROPIC,
      defaultModel: 'claude-opus-4-8',
      priority: 2
    })
    const result = await sdkFor([failing, anthropic]).invoke('text.chat', turn, {
      reasoningEffort: 'medium'
    })

    // The failed attempt was planned for its own wire, the fallback for Anthropic's.
    expect((failing.adapter.chat as ReturnType<typeof vi.fn>).mock.calls[0]?.[1]).toMatchObject({
      reasoningPlan: { wire: 'openai-reasoning-effort' }
    })
    expect(planOf(anthropic.chatOptions[0])?.wire).toBe('anthropic-adaptive')
    expect(result.reasoningEffort).toEqual({
      requested: 'medium',
      applied: 'medium',
      status: 'applied'
    })
  })
})
