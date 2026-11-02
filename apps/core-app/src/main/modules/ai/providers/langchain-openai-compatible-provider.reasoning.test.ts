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
  urls: [] as string[],
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

function responsesResponse(): Response {
  return new Response(
    JSON.stringify({
      id: 'resp-reasoning',
      object: 'response',
      created_at: 0,
      model: 'wire-test',
      status: 'completed',
      output: [
        {
          type: 'message',
          id: 'msg-reasoning',
          status: 'completed',
          role: 'assistant',
          content: [{ type: 'output_text', text: 'ok', annotations: [] }]
        }
      ],
      usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 }
    }),
    { status: 200, headers: { 'content-type': 'application/json' } }
  )
}

function responsesStreamResponse(): Response {
  const message = {
    type: 'message',
    id: 'msg-reasoning',
    status: 'completed',
    role: 'assistant',
    content: [{ type: 'output_text', text: 'ok', annotations: [] }]
  }
  const usage = { input_tokens: 1, output_tokens: 1, total_tokens: 2 }
  const events = [
    {
      type: 'response.created',
      sequence_number: 0,
      response: {
        id: 'resp-reasoning',
        object: 'response',
        created_at: 0,
        model: 'wire-test',
        status: 'in_progress',
        output: []
      }
    },
    {
      type: 'response.output_item.added',
      sequence_number: 1,
      output_index: 0,
      item: { ...message, status: 'in_progress', content: [] }
    },
    {
      type: 'response.output_text.delta',
      sequence_number: 2,
      item_id: 'msg-reasoning',
      output_index: 0,
      content_index: 0,
      delta: 'ok',
      logprobs: []
    },
    { type: 'response.output_item.done', sequence_number: 3, output_index: 0, item: message },
    {
      type: 'response.completed',
      sequence_number: 4,
      response: {
        id: 'resp-reasoning',
        object: 'response',
        created_at: 0,
        model: 'wire-test',
        status: 'completed',
        output: [message],
        usage
      }
    }
  ]
  const body = events
    .map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)
    .join('')
  return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } })
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
    fetch: async (url: unknown, init?: { body?: unknown }) => {
      wire.urls.push(String(url))
      wire.bodies.push(JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>)
      if (String(url).endsWith('/responses')) {
        return wire.streaming ? responsesStreamResponse() : responsesResponse()
      }
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
  wire.urls.length = 0
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

    // gpt-5.6 is a Responses name: its level travels in `reasoning`, not in `reasoning_effort`.
    expect(wire.bodies[0]).toMatchObject({ reasoning_effort: 'xhigh' })
    expect(wire.urls[1]).toMatch(/\/responses$/)
    expect(wire.bodies[1]).toMatchObject({ reasoning: { effort: 'max' } })
    expect(wire.bodies[1]).not.toHaveProperty('reasoning_effort')
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

  it('keeps a caller temperature only when no reasoning level applies', async () => {
    const openai = config({})
    const sampled = { ...turn, temperature: 0.7 }
    await new OpenAIProvider(openai).chat(sampled, plannedOptions(openai, 'gpt-5.5', 'high'))
    await new OpenAIProvider(openai).chat(sampled, plannedOptions(openai, 'gpt-5.5', undefined))

    expect(wire.bodies[0]).not.toHaveProperty('temperature')
    expect(wire.bodies[1]).toMatchObject({ temperature: 0.7 })
  })

  it('streams an imported openai-responses provider through the Responses API', async () => {
    const responses = config({ metadata: { transport: 'responses' } })
    wire.streaming = true
    const deltas: string[] = []
    for await (const chunk of new OpenAIProvider(responses).chatStream(
      turn,
      plannedOptions(responses, 'gpt-5.5', 'high')
    )) {
      if (chunk.delta) deltas.push(chunk.delta)
    }

    expect(wire.urls[0]).toMatch(/\/responses$/)
    expect(wire.bodies[0]).toMatchObject({
      model: 'gpt-5.5',
      stream: true,
      reasoning: { effort: 'high' }
    })
    expect(wire.bodies[0]).not.toHaveProperty('reasoning_effort')
    expect(wire.bodies[0]).not.toHaveProperty('n')
    expect(deltas.join('')).toBe('ok')
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
