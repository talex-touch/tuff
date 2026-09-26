import type { IntelligenceProviderConfig } from '@talex-touch/tuff-intelligence'
import { IntelligenceProviderType } from '@talex-touch/tuff-intelligence'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { planProviderReasoning, withReasoningPlan } from '../reasoning-effort-runtime'

/**
 * The request body as the installed LangChain / OpenAI client actually writes it. `@langchain/openai`
 * is deliberately not mocked (the sibling provider tests replace its model class, which cannot show
 * what reaches the wire); only the fetch at the network seam is, so every assertion below is on the
 * JSON that would have left the machine.
 */
const wire = vi.hoisted(() => ({
  bodies: [] as Array<Record<string, unknown>>,
  streaming: false
}))

function completionResponse(): Response {
  return new Response(
    JSON.stringify({
      id: 'chatcmpl-reasoning',
      object: 'chat.completion',
      created: 0,
      model: 'wire-test',
      choices: [{ index: 0, message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }
    }),
    { status: 200, headers: { 'content-type': 'application/json' } }
  )
}

function streamResponse(): Response {
  const chunk = JSON.stringify({
    id: 'chatcmpl-reasoning',
    object: 'chat.completion.chunk',
    created: 0,
    model: 'wire-test',
    choices: [{ index: 0, delta: { content: 'ok' }, finish_reason: null }]
  })
  return new Response(`data: ${chunk}\n\ndata: [DONE]\n\n`, {
    status: 200,
    headers: { 'content-type': 'text/event-stream' }
  })
}

vi.mock('../../network', () => ({
  getNetworkService: () => ({
    fetch: async (_url: unknown, init?: { body?: unknown }) => {
      wire.bodies.push(JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>)
      return wire.streaming ? streamResponse() : completionResponse()
    }
  })
}))

import { CustomProvider } from './custom-provider'
import { DeepSeekProvider } from './deepseek-provider'
import { OpenAIProvider } from './openai-provider'

function config(overrides: Partial<IntelligenceProviderConfig>): IntelligenceProviderConfig {
  return {
    id: 'openai-default',
    type: IntelligenceProviderType.OPENAI,
    name: 'OpenAI',
    enabled: true,
    apiKey: 'test-only-key',
    baseUrl: 'https://wire.example.test/v1',
    priority: 1,
    ...overrides
  }
}

/** What the SDK hands the provider: the model preference, plus the plan made for that provider. */
function plannedOptions(
  providerConfig: IntelligenceProviderConfig,
  model: string,
  reasoningEffort?: 'low' | 'medium' | 'high' | 'max'
) {
  const options = { modelPreference: [model], ...(reasoningEffort ? { reasoningEffort } : {}) }
  return withReasoningPlan(options, planProviderReasoning(options, providerConfig, model))
}

const turn = { messages: [{ role: 'user' as const, content: 'hi' }] }

beforeEach(() => {
  wire.bodies.length = 0
  wire.streaming = false
})

describe('OpenAI-compatible reasoning on the wire', () => {
  it('sends no reasoning field at all on auto', async () => {
    const openai = config({})
    await new OpenAIProvider(openai).chat(turn, plannedOptions(openai, 'gpt-5.5'))

    expect(wire.bodies).toHaveLength(1)
    // The whole body, not only the absence of the new fields: auto must not change a byte.
    expect(wire.bodies[0]).toEqual({
      model: 'gpt-5.5',
      n: 1,
      stream: false,
      messages: [{ role: 'user', content: 'hi' }]
    })
  })

  it('sends the planned level as reasoning_effort, and no temperature', async () => {
    const openai = config({})
    await new OpenAIProvider(openai).chat(turn, plannedOptions(openai, 'gpt-5.5', 'high'))

    expect(wire.bodies[0]).toMatchObject({ model: 'gpt-5.5', reasoning_effort: 'high' })
    expect(wire.bodies[0]).not.toHaveProperty('temperature')
    expect(wire.bodies[0]).not.toHaveProperty('thinking')
  })

  it("spells 极高 as the model's strongest level, past the SDK's own types", async () => {
    const openai = config({})
    await new OpenAIProvider(openai).chat(turn, plannedOptions(openai, 'gpt-5.5', 'max'))
    await new OpenAIProvider(openai).chat(turn, plannedOptions(openai, 'gpt-5.6-terra', 'max'))

    expect(wire.bodies.map((body) => body.reasoning_effort)).toEqual(['xhigh', 'max'])
  })

  it('sends nothing to a model that takes no effort, streaming included', async () => {
    const gateway = config({ id: 'my-gateway', type: IntelligenceProviderType.CUSTOM })
    wire.streaming = true
    for (const reasoningEffort of ['high', undefined] as const) {
      for await (const _chunk of new CustomProvider(gateway).chatStream(
        turn,
        plannedOptions(gateway, 'gpt-4o', reasoningEffort)
      )) {
        void _chunk
      }
    }

    expect(wire.bodies[0]).toMatchObject({ model: 'gpt-4o', stream: true })
    expect(wire.bodies[0]).not.toHaveProperty('reasoning_effort')
    // A plan with nothing to send builds exactly the request auto builds.
    expect(wire.bodies[0]).toEqual(wire.bodies[1])
  })

  it('switches DeepSeek V4 thinking on alongside the level, and replays history bare', async () => {
    const deepseek = config({ id: 'deepseek-default', type: IntelligenceProviderType.DEEPSEEK })
    wire.streaming = true
    const history = {
      messages: [
        { role: 'user' as const, content: 'first' },
        { role: 'assistant' as const, content: 'answer one' },
        { role: 'user' as const, content: 'second' }
      ]
    }
    for await (const _chunk of new DeepSeekProvider(deepseek).chatStream(
      history,
      plannedOptions(deepseek, 'deepseek-v4-flash', 'high')
    )) {
      void _chunk
    }

    expect(wire.bodies[0]).toMatchObject({
      model: 'deepseek-v4-flash',
      stream: true,
      reasoning_effort: 'high',
      thinking: { type: 'enabled' }
    })
    // Pinned as the known gap, not endorsed: DeepSeek's thinking mode may require replayed assistant
    // turns to carry `reasoning_content`, and LangChain 0.4's message conversion cannot add it.
    expect(wire.bodies[0]?.messages).toEqual([
      { role: 'user', content: 'first' },
      { role: 'assistant', content: 'answer one' },
      { role: 'user', content: 'second' }
    ])
  })

  it('leaves the legacy DeepSeek ids alone: their model is the level', async () => {
    const deepseek = config({ id: 'deepseek-default', type: IntelligenceProviderType.DEEPSEEK })
    for (const reasoningEffort of ['high', undefined] as const) {
      await new DeepSeekProvider(deepseek).chat(
        turn,
        plannedOptions(deepseek, 'deepseek-chat', reasoningEffort)
      )
    }

    expect(wire.bodies[0]).not.toHaveProperty('reasoning_effort')
    expect(wire.bodies[0]).not.toHaveProperty('thinking')
    expect(wire.bodies[0]).toEqual(wire.bodies[1])
  })
})
