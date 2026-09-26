import type { IntelligenceProviderAdapterPayload } from './tuffIntelligenceProviderAdapters'
import { planReasoningEffort } from '@talex-touch/utils/intelligence/reasoning-effort'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  invokeAnthropicProviderAdapter,
  invokeOpenAiCompatibleProviderAdapter,
  streamAnthropicProviderAdapter,
  streamOpenAiCompatibleProviderAdapter,
} from './tuffIntelligenceLangChainProviderAdapters'

/**
 * What each Nexus LangChain adapter builds its model with, per plan. The fields' effect on the wire
 * is LangChain's, and is pinned against the same installed versions by core-app's provider tests
 * (`*.reasoning.test.ts`); here the question is only which fields each adapter hands over.
 */
const built = vi.hoisted(() => ({ openai: [] as Array<Record<string, unknown>>, anthropic: [] as Array<Record<string, unknown>> }))

function answer() {
  return { content: 'ok', usage_metadata: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } }
}

async function* chunks() {
  yield { content: 'ok' }
}

vi.mock('@langchain/openai', () => ({
  ChatOpenAI: class {
    constructor(config: Record<string, unknown>) {
      built.openai.push(config)
    }

    invoke() { return Promise.resolve(answer()) }
    stream() { return Promise.resolve(chunks()) }
  },
}))

vi.mock('@langchain/anthropic', () => ({
  ChatAnthropic: class {
    constructor(config: Record<string, unknown>) {
      built.anthropic.push(config)
    }

    invoke() { return Promise.resolve(answer()) }
    stream() { return Promise.resolve(chunks()) }
  },
}))

function payload(
  type: string,
  model: string,
  reasoningEffort?: 'low' | 'medium' | 'high' | 'max',
  maxTokens?: number,
): IntelligenceProviderAdapterPayload {
  return {
    context: {
      provider: { id: `ip_${type}`, type, name: type, baseUrl: null } as any,
      model,
      apiKey: 'sk-test',
      timeoutMs: 30_000,
    },
    messages: [{ role: 'user', content: 'hello' }],
    ...(maxTokens ? { maxTokens } : {}),
    ...(reasoningEffort
      ? { reasoning: planReasoningEffort(reasoningEffort, { providerType: type, model }) }
      : {}),
  }
}

async function drain(stream: AsyncGenerator<unknown>): Promise<void> {
  for await (const _chunk of stream) void _chunk
}

beforeEach(() => {
  built.openai.length = 0
  built.anthropic.length = 0
})

describe('OpenAI-compatible adapters', () => {
  it('keep the fixed temperature and send no effort on auto', async () => {
    await invokeOpenAiCompatibleProviderAdapter(payload('openai', 'gpt-5.5'))
    await drain(streamOpenAiCompatibleProviderAdapter(payload('openai', 'gpt-5.5')))

    for (const config of built.openai) {
      expect(config.temperature).toBe(0.2)
      expect(config).not.toHaveProperty('reasoningEffort')
      expect(config).not.toHaveProperty('modelKwargs')
    }
    // Whole configs, as they were before the setting existed: auto adds and drops nothing.
    const base = {
      apiKey: 'sk-test',
      model: 'gpt-5.5',
      temperature: 0.2,
      timeout: 30_000,
      maxTokens: undefined,
      configuration: { baseURL: expect.any(String) },
    }
    expect(built.openai[0]).toStrictEqual(base)
    expect(built.openai[1]).toStrictEqual({ ...base, streaming: true, streamUsage: true })
  })

  it('hand a reasoning model its level and no temperature', async () => {
    await invokeOpenAiCompatibleProviderAdapter(payload('openai', 'gpt-5.5', 'max'))
    await drain(streamOpenAiCompatibleProviderAdapter(payload('openai', 'o3', 'medium')))

    expect(built.openai[0]).toMatchObject({ model: 'gpt-5.5', reasoningEffort: 'xhigh' })
    expect(built.openai[1]).toMatchObject({ model: 'o3', reasoningEffort: 'medium', streaming: true })
    for (const config of built.openai) expect(config).not.toHaveProperty('temperature')
  })

  it('switch DeepSeek V4 thinking on', async () => {
    await drain(streamOpenAiCompatibleProviderAdapter(payload('deepseek', 'deepseek-v4-pro', 'low')))

    expect(built.openai[0]).toMatchObject({
      reasoningEffort: 'high',
      modelKwargs: { thinking: { type: 'enabled' } },
    })
  })

  it('ignore a plan that sends nothing', async () => {
    await invokeOpenAiCompatibleProviderAdapter(payload('openai', 'gpt-4o-mini', 'high'))
    await invokeOpenAiCompatibleProviderAdapter(payload('siliconflow', 'deepseek-ai/DeepSeek-R1', 'high'))

    for (const config of built.openai) {
      expect(config.temperature).toBe(0.2)
      expect(config).not.toHaveProperty('reasoningEffort')
    }
  })
})

describe('Anthropic adapters', () => {
  it('keep the old ceiling and no thinking on auto', async () => {
    await invokeAnthropicProviderAdapter(payload('anthropic', 'claude-opus-4-8'))
    await drain(streamAnthropicProviderAdapter(payload('anthropic', 'claude-opus-4-8')))

    expect(built.anthropic[0]).toMatchObject({ maxTokens: 1200 })
    for (const key of ['temperature', 'thinking', 'invocationKwargs'])
      expect(built.anthropic[0]).not.toHaveProperty(key)
    // Whole configs, as they were before the setting existed: auto adds and drops nothing.
    const base = {
      anthropicApiKey: 'sk-test',
      model: 'claude-opus-4-8',
      maxTokens: 1200,
      anthropicApiUrl: expect.any(String),
      clientOptions: { baseURL: expect.any(String) },
    }
    expect(built.anthropic[0]).toStrictEqual(base)
    expect(built.anthropic[1]).toStrictEqual({ ...base, streaming: true, streamUsage: true })
  })

  it('switch an adaptive model to adaptive thinking, capped when not streaming', async () => {
    await drain(streamAnthropicProviderAdapter(payload('anthropic', 'claude-opus-4-8', 'max')))
    await invokeAnthropicProviderAdapter(payload('anthropic', 'claude-opus-4-8', 'max'))

    expect(built.anthropic[0]).toMatchObject({
      temperature: 1,
      maxTokens: 1200 + 32768,
      thinking: { type: 'enabled', budget_tokens: 1024 },
      invocationKwargs: { thinking: { type: 'adaptive' }, output_config: { effort: 'max' } },
      streaming: true,
    })
    expect(built.anthropic[1]).toMatchObject({ maxTokens: 21_333 })
  })

  it('give a budget model its budget above the caller\'s declared cap', async () => {
    await invokeAnthropicProviderAdapter(payload('anthropic', 'claude-sonnet-4-5', 'low', 800))

    // The ceiling is the declared 800 plus the 2048 budget; the budget then gives way just enough
    // that the answer keeps the API's 1024-token floor (pi-ai's `thinkingBudgetTokens` does the same).
    expect(built.anthropic[0]).toMatchObject({
      temperature: 1,
      maxTokens: 800 + 2048,
      thinking: { type: 'enabled', budget_tokens: 800 + 2048 - 1024 },
    })
    expect(built.anthropic[0]).not.toHaveProperty('invocationKwargs')
  })
})
