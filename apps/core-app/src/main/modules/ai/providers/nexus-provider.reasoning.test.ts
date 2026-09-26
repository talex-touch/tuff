import type {
  IntelligenceProviderConfig,
  IntelligenceStreamChunk
} from '@talex-touch/tuff-intelligence'
import { Readable } from 'node:stream'
import { IntelligenceProviderType } from '@talex-touch/tuff-intelligence'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { planProviderReasoning, withReasoningPlan } from '../reasoning-effort-runtime'

const networkMocks = vi.hoisted(() => ({
  request: vi.fn(),
  requestStream: vi.fn()
}))

vi.mock('../../network', () => ({
  getNetworkService: () => networkMocks
}))

vi.mock('../../nexus/runtime-base', () => ({
  getRuntimeNexusBaseUrl: () => 'https://nexus.example.com'
}))

import { NexusProvider } from './nexus-provider'

const CONFIG: IntelligenceProviderConfig = {
  id: 'tuff-nexus-default',
  type: IntelligenceProviderType.CUSTOM,
  name: 'Tuff Nexus',
  enabled: true,
  apiKey: 'app-token',
  defaultModel: 'gpt-4o-mini',
  priority: 1,
  metadata: { origin: 'tuff-nexus', tokenMode: 'auth' }
}

function planned(reasoningEffort?: 'low' | 'medium' | 'high' | 'max') {
  const options = { timeout: 12_000, ...(reasoningEffort ? { reasoningEffort } : {}) }
  return withReasoningPlan(options, planProviderReasoning(options, CONFIG, 'gpt-4o-mini'))
}

function streamOf(frames: Array<Record<string, unknown>>) {
  return {
    status: 200,
    statusText: 'OK',
    headers: { 'content-type': 'text/event-stream' },
    url: 'https://nexus.example.com/api/v1/intelligence/stream',
    stream: Readable.from([frames.map((frame) => `data: ${JSON.stringify(frame)}\n\n`).join('')]),
    complete: vi.fn(),
    cancel: vi.fn()
  }
}

const turn = { messages: [{ role: 'user' as const, content: 'hi' }] }

async function collect(options: ReturnType<typeof planned>): Promise<IntelligenceStreamChunk[]> {
  const chunks: IntelligenceStreamChunk[] = []
  for await (const chunk of new NexusProvider({ ...CONFIG }).chatStream(turn, options)) {
    chunks.push(chunk)
  }
  return chunks
}

function sentOptions(mock: typeof networkMocks.request): Record<string, unknown> {
  return (mock.mock.calls[0]?.[0] as { body: { options: Record<string, unknown> } }).body.options
}

describe('Nexus reasoning effort', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('forwards the level asked for, and leaves the body as it was on auto', async () => {
    // A fresh body per request: a Readable is consumed by the first one.
    networkMocks.requestStream.mockImplementation(async () =>
      streamOf([{ type: 'delta', delta: 'ok' }, { type: 'end' }])
    )

    await collect(planned('high'))
    expect(sentOptions(networkMocks.requestStream)).toMatchObject({ reasoningEffort: 'high' })

    networkMocks.requestStream.mockClear()
    await collect(planned())
    expect(sentOptions(networkMocks.requestStream)).not.toHaveProperty('reasoningEffort')
    // As it serializes onto the wire: auto's options body is exactly the pre-setting one.
    expect(JSON.parse(JSON.stringify(sentOptions(networkMocks.requestStream)))).toEqual({
      timeoutMs: 12_000
    })
  })

  it("carries the server's decision for its upstream on the chunks after it arrives", async () => {
    const decision = { requested: 'high', applied: 'high', status: 'applied' }
    networkMocks.requestStream.mockResolvedValue(
      streamOf([
        { type: 'start', provider: 'ip_openai', model: 'gpt-5.5', reasoningEffort: decision },
        { type: 'delta', delta: 'ok' },
        { type: 'usage', usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 } },
        { type: 'end' }
      ])
    )

    const chunks = await collect(planned('high'))
    expect(chunks.map((chunk) => chunk.reasoningEffort)).toEqual([decision, decision])
  })

  it('ignores a decision that does not add up', async () => {
    networkMocks.requestStream.mockResolvedValue(
      streamOf([
        {
          type: 'start',
          reasoningEffort: { requested: 'high', applied: null, status: 'applied' }
        },
        { type: 'delta', delta: 'ok' },
        { type: 'end' }
      ])
    )

    const chunks = await collect(planned('high'))
    expect(chunks.every((chunk) => !('reasoningEffort' in chunk))).toBe(true)
  })

  it("reads the decision off an invoke response's metadata", async () => {
    networkMocks.request.mockResolvedValue({
      data: {
        invocation: {
          capabilityId: 'text.chat',
          result: 'ok',
          usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
          model: 'deepseek-chat',
          provider: 'ip_deepseek',
          metadata: {
            reasoningEffort: { requested: 'max', applied: null, status: 'unsupported-model' }
          }
        }
      }
    })

    const result = await new NexusProvider({ ...CONFIG }).chat(turn, planned('max'))
    expect(sentOptions(networkMocks.request)).toMatchObject({ reasoningEffort: 'max' })
    expect(result.reasoningEffort).toEqual({
      requested: 'max',
      applied: null,
      status: 'unsupported-model'
    })
  })
})
