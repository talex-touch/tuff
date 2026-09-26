import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { IntelligenceProviderConfig } from '@talex-touch/tuff-intelligence'
import { ChatAnthropic } from '@langchain/anthropic'
import { IntelligenceProviderType } from '@talex-touch/tuff-intelligence'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
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
  it("leaves an auto turn exactly as before, LangChain's disabled thinking included", async () => {
    await streamed('claude-opus-4-8')

    // The whole body, not only the absence of the new fields: auto must not change a byte. The
    // sampling knobs are LangChain 0.3.34's own defaults, sent before this setting existed too.
    expect(bodies[0]).toEqual({
      model: 'claude-opus-4-8',
      max_tokens: 1024,
      temperature: 0.7,
      top_k: -1,
      top_p: -1,
      thinking: { type: 'disabled' },
      stream: true,
      messages: [{ role: 'user', content: 'hi' }]
    })
  })

  it('switches an adaptive model to adaptive thinking with an effort, and no sampling knobs', async () => {
    const deltas = await streamed('claude-opus-4-8', 'max')

    expect(bodies[0]).toMatchObject({
      model: 'claude-opus-4-8',
      stream: true,
      thinking: { type: 'adaptive' },
      output_config: { effort: 'max' },
      max_tokens: 1024 + 32768
    })
    for (const knob of ['temperature', 'top_k', 'top_p']) expect(bodies[0]).not.toHaveProperty(knob)
    // The thinking deltas are dropped, not shown as answer text (D11-f: no reasoning display).
    expect(deltas).toEqual(['answer'])
  })

  it('gives a budget model its budget and room for the answer on top', async () => {
    const deltas = await streamed('claude-sonnet-4-5', 'medium')

    expect(bodies[0]).toMatchObject({
      model: 'claude-sonnet-4-5',
      thinking: { type: 'enabled', budget_tokens: 8192 },
      max_tokens: 1024 + 8192
    })
    expect(bodies[0]).not.toHaveProperty('temperature')
    expect(bodies[0]).not.toHaveProperty('output_config')
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

    expect(bodies[0]).toMatchObject({
      thinking: { type: 'disabled' },
      temperature: 0.7,
      max_tokens: 1024
    })
    expect(bodies[0]).not.toHaveProperty('output_config')
    // A plan with nothing to send builds exactly the request auto builds.
    expect(bodies[0]).toEqual(bodies[1])
  })
})

describe('ChatAnthropic.invocationParams under a plan', () => {
  it('validates the thinking branch LangChain would otherwise reject', () => {
    // Built the way the provider builds it, then asked for its params directly: LangChain throws on
    // a thinking config with a temperature other than 1, which is why the provider pins it.
    const model = new ChatAnthropic({
      anthropicApiKey: 'test-only-key',
      model: 'claude-opus-4-7',
      temperature: 1,
      maxTokens: 5120,
      thinking: { type: 'enabled', budget_tokens: 1024 },
      invocationKwargs: { thinking: { type: 'adaptive' }, output_config: { effort: 'low' } }
    })
    const params = model.invocationParams({}) as unknown as Record<string, unknown>

    expect(params).toMatchObject({
      model: 'claude-opus-4-7',
      max_tokens: 5120,
      thinking: { type: 'adaptive' },
      output_config: { effort: 'low' }
    })
    expect(params).not.toHaveProperty('temperature')
    expect(params).not.toHaveProperty('top_k')
    expect(params).not.toHaveProperty('top_p')
  })
})
