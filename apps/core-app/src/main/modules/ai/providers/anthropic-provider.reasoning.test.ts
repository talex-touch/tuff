import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import type {
  IntelligenceChatPayload,
  IntelligenceInvokeOptions,
  IntelligenceProviderConfig
} from '@talex-touch/tuff-intelligence'
import { IntelligenceProviderType } from '@talex-touch/tuff-intelligence'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { planChatModelRequest } from '../model-request-plan'
import { planProviderReasoning, withReasoningPlan } from '../reasoning-effort-runtime'
import { AnthropicProvider } from './anthropic-provider'

/**
 * Reasoning effort as the installed `@langchain/anthropic` 0.3.34 / `@anthropic-ai/sdk` 0.65 pair
 * actually sends it. Nothing here is mocked: the provider talks to a loopback server, which records
 * each JSON body and answers in the Messages API's own shapes.
 *
 * The adaptive path is the one this pins hardest. Those SDK types know only `enabled` / `disabled`
 * thinking, so `{ type: 'adaptive' }` and `output_config` ride `invocationKwargs`; that they arrive
 * on the wire, with no temperature beside them, is read off the body rather than assumed.
 */
const bodies: Array<Record<string, unknown>> = []
let baseUrl = ''
const thinkingSchema = z
  .object({ type: z.string(), budget_tokens: z.number().optional() })
  .optional()
let closeServer: (() => Promise<void>) | null = null

function sse(events: Array<Record<string, unknown>>): string {
  return events.map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join('')
}

/** A turn that thinks first: the thinking text must never reach the answer. */
const STREAMED_TURN = sse([
  {
    type: 'message_start',
    message: {
      id: 'msg_loopback',
      type: 'message',
      role: 'assistant',
      model: 'loopback',
      content: [],
      stop_reason: null,
      stop_sequence: null,
      usage: { input_tokens: 3, output_tokens: 1 }
    }
  },
  {
    type: 'content_block_start',
    index: 0,
    content_block: { type: 'thinking', thinking: '', signature: '' }
  },
  {
    type: 'content_block_delta',
    index: 0,
    delta: { type: 'thinking_delta', thinking: 'private chain of thought' }
  },
  { type: 'content_block_delta', index: 0, delta: { type: 'signature_delta', signature: 'sig' } },
  { type: 'content_block_stop', index: 0 },
  { type: 'content_block_start', index: 1, content_block: { type: 'text', text: '' } },
  { type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text: 'answer' } },
  { type: 'content_block_stop', index: 1 },
  {
    type: 'message_delta',
    delta: { stop_reason: 'end_turn', stop_sequence: null },
    usage: { output_tokens: 9 }
  },
  { type: 'message_stop' }
])

const WHOLE_TURN = JSON.stringify({
  id: 'msg_loopback',
  type: 'message',
  role: 'assistant',
  model: 'loopback',
  content: [
    { type: 'thinking', thinking: 'private chain of thought', signature: 'sig' },
    { type: 'text', text: 'answer' }
  ],
  stop_reason: 'end_turn',
  stop_sequence: null,
  usage: { input_tokens: 3, output_tokens: 9 }
})

function handle(request: IncomingMessage, response: ServerResponse): void {
  let raw = ''
  request.setEncoding('utf8')
  request.on('data', (chunk: string) => {
    raw += chunk
  })
  request.on('end', () => {
    const body = JSON.parse(raw) as Record<string, unknown>
    bodies.push(body)
    if (body.stream === true) {
      response.writeHead(200, { 'content-type': 'text/event-stream' })
      response.end(STREAMED_TURN)
      return
    }
    response.writeHead(200, { 'content-type': 'application/json' })
    response.end(WHOLE_TURN)
  })
}

beforeAll(async () => {
  const server = createServer(handle)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`
  closeServer = async () => {
    server.closeAllConnections()
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    )
  }
})

afterAll(async () => {
  await closeServer?.()
})

beforeEach(() => {
  bodies.length = 0
})

function config(): IntelligenceProviderConfig {
  return {
    id: 'anthropic-default',
    type: IntelligenceProviderType.ANTHROPIC,
    name: 'Anthropic',
    enabled: true,
    apiKey: 'test-only-key',
    baseUrl,
    priority: 1
  }
}

function plannedOptions(model: string, reasoningEffort?: 'low' | 'medium' | 'high' | 'max') {
  const options = { modelPreference: [model], ...(reasoningEffort ? { reasoningEffort } : {}) }
  return withReasoningPlan(options, planProviderReasoning(options, config(), model))
}

interface CappedRequest {
  provider: AnthropicProvider
  payload: IntelligenceChatPayload
  options: IntelligenceInvokeOptions
}

function cappedRequest(
  model: string,
  callerCap?: number,
  bindingCap?: number,
  effort?: 'low'
): CappedRequest {
  const provider = {
    ...config(),
    models: [
      {
        id: model,
        ...(bindingCap === undefined
          ? {}
          : { maxTokens: bindingCap, maxTokensSource: 'user' as const })
      }
    ]
  }
  const request = planChatModelRequest(
    { ...turn, ...(callerCap === undefined ? {} : { maxTokens: callerCap }) },
    { modelPreference: [model], ...(effort ? { reasoningEffort: effort } : {}) },
    provider
  )
  return {
    provider: new AnthropicProvider(provider),
    payload: request.payload,
    options: withReasoningPlan(
      request.options,
      planProviderReasoning(request.options, provider, model)
    )
  }
}

async function invokeCapped(request: CappedRequest, streaming: boolean) {
  if (!streaming) return (await request.provider.chat(request.payload, request.options)).result
  let answer = ''
  for await (const chunk of request.provider.chatStream(request.payload, request.options))
    answer += chunk.delta ?? ''
  return answer
}
const turn = { messages: [{ role: 'user' as const, content: 'hi' }] }

async function streamed(model: string, reasoningEffort?: 'low' | 'medium' | 'high' | 'max') {
  const deltas: string[] = []
  for await (const chunk of new AnthropicProvider(config()).chatStream(
    turn,
    plannedOptions(model, reasoningEffort)
  )) {
    if (chunk.delta) deltas.push(chunk.delta)
  }
  return deltas
}

describe('Anthropic reasoning on the wire', () => {
  it('auto does not enable thinking or attach an effort to an explicitly capped turn', async () => {
    await new AnthropicProvider(config()).chat(
      { ...turn, maxTokens: 96, temperature: 0.3 },
      plannedOptions('claude-opus-4-8')
    )

    expect(bodies[0]).toMatchObject({ max_tokens: 96, temperature: 0.3 })
    expect(['enabled', 'adaptive']).not.toContain(thinkingSchema.parse(bodies[0].thinking)?.type)
    expect(bodies[0]).not.toHaveProperty('output_config')
  })

  it('switches an adaptive model to adaptive thinking with an effort, and no sampling knobs', async () => {
    const deltas = await streamed('claude-opus-4-8', 'max')

    expect(bodies[0]).toMatchObject({
      model: 'claude-opus-4-8',
      stream: true,
      thinking: { type: 'adaptive' },
      output_config: { effort: 'max' }
    })
    for (const knob of ['temperature', 'top_k', 'top_p']) expect(bodies[0]).not.toHaveProperty(knob)
    // The thinking deltas are dropped, not shown as answer text (D11-f: no reasoning display).
    expect(deltas).toEqual(['answer'])
  })

  it('gives a budget model its budget and room for the answer on top', async () => {
    const deltas = await streamed('claude-sonnet-4-5', 'medium')

    expect(bodies[0]).toMatchObject({
      model: 'claude-sonnet-4-5',
      thinking: { type: 'enabled', budget_tokens: 8192 }
    })
    expect(bodies[0]).not.toHaveProperty('temperature')
    expect(bodies[0]).not.toHaveProperty('output_config')
    expect(bodies[0].max_tokens).toBeGreaterThan(8192)
    expect(deltas).toEqual(['answer'])
  })

  it('keeps a non-streaming thinking request under the SDK ceiling and answers with the text only', async () => {
    const result = await new AnthropicProvider(config()).chat(
      turn,
      plannedOptions('claude-opus-4-6', 'max')
    )

    expect(bodies[0]).toMatchObject({
      model: 'claude-opus-4-6',
      thinking: { type: 'adaptive' },
      output_config: { effort: 'max' },
      max_tokens: 21_333
    })
    expect(bodies[0]?.stream).not.toBe(true)
    expect(result.result).toBe('answer')
  })

  it('sends nothing new to a model outside the table', async () => {
    // Not a real id on purpose: the SDK logs a deprecation notice for the retired ones.
    await streamed('claude-legacy-sonnet', 'high')
    await streamed('claude-legacy-sonnet')

    expect(['enabled', 'adaptive']).not.toContain(thinkingSchema.parse(bodies[0].thinking)?.type)
    expect(bodies[0]).not.toHaveProperty('output_config')
    // A plan with nothing to send builds exactly the request auto builds.
    expect(bodies[0]).toEqual(bodies[1])
  })
})

describe.each([false, true])('Anthropic explicit output ceilings (streaming=%s)', (streaming) => {
  it.each([
    { name: 'caller 96', callerCap: 96, bindingCap: undefined },
    { name: 'caller 1024', callerCap: 1024, bindingCap: undefined },
    { name: 'binding 96', callerCap: undefined, bindingCap: 96 },
    { name: 'binding 1024', callerCap: undefined, bindingCap: 1024 },
    { name: 'caller below larger binding', callerCap: 96, bindingCap: 8192 },
    { name: 'binding below larger caller', callerCap: 8192, bindingCap: 1024 }
  ])(
    '$name rejects legacy thinking before network instead of raising or disabling the cap',
    async ({ callerCap, bindingCap }) => {
      const request = cappedRequest('claude-sonnet-4-5', callerCap, bindingCap, 'low')
      await expect(invokeCapped(request, streaming)).rejects.toMatchObject({
        code: 'MODEL_UNSUPPORTED',
        reason: 'MODEL_REASONING_OUTPUT_BUDGET',
        message: expect.stringContaining('MODEL_REASONING_OUTPUT_BUDGET')
      })
      expect(bodies).toEqual([])
    }
  )

  it.each([
    { name: 'caller boundary', callerCap: 1025, bindingCap: undefined, cap: 1025 },
    { name: 'binding boundary', callerCap: 8192, bindingCap: 1025, cap: 1025 },
    { name: 'larger caller ceiling', callerCap: 4096, bindingCap: 8192, cap: 4096 }
  ])(
    '$name permits a valid legacy budget strictly below the actual ceiling',
    async ({ callerCap, bindingCap, cap }) => {
      expect(
        await invokeCapped(
          cappedRequest('claude-sonnet-4-5', callerCap, bindingCap, 'low'),
          streaming
        )
      ).toBe('answer')
      expect(bodies[0]).toMatchObject({ max_tokens: cap, thinking: { type: 'enabled' } })
      const thinking = thinkingSchema.parse(bodies[0].thinking)
      expect(thinking?.budget_tokens).toBeGreaterThanOrEqual(1024)
      expect(thinking?.budget_tokens).toBeLessThan(cap)
      expect(bodies[0]).not.toHaveProperty('temperature')
    }
  )

  it.each([
    { name: 'caller', callerCap: 96, bindingCap: 8192 },
    { name: 'binding', callerCap: 8192, bindingCap: 96 }
  ])(
    'adaptive thinking allows a small $name ceiling through the installed SDK',
    async ({ callerCap, bindingCap }) => {
      expect(
        await invokeCapped(
          cappedRequest('claude-opus-4-8', callerCap, bindingCap, 'low'),
          streaming
        )
      ).toBe('answer')
      expect(bodies[0]).toMatchObject({
        max_tokens: 96,
        thinking: { type: 'adaptive' },
        output_config: { effort: 'low' }
      })
      expect(bodies[0]).not.toHaveProperty('temperature')
    }
  )
})
