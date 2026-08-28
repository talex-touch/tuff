import { PassThrough, Readable } from 'node:stream'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type {
  IntelligenceInvokeOptions,
  IntelligenceStreamChunk,
  IntelligenceVisionOcrPayload
} from '@talex-touch/tuff-intelligence'
import { IntelligenceProviderType } from '@talex-touch/tuff-intelligence'

vi.mock('@talex-touch/tuff-native', () => ({
  getNativeOcrSupport: vi.fn(),
  recognizeImageText: vi.fn()
}))

import { getNativeOcrSupport, recognizeImageText } from '@talex-touch/tuff-native'
import { NetworkHttpStatusError } from '@talex-touch/utils/network'
import { OpenAiCompatibleLangChainProvider } from './langchain-openai-compatible-provider'
import { LocalProvider } from './local-provider'

const mockedGetNativeOcrSupport = vi.mocked(getNativeOcrSupport)
const mockedRecognizeImageText = vi.mocked(recognizeImageText)
const networkMocks = vi.hoisted(() => ({
  request: vi.fn(),
  requestStream: vi.fn()
}))

vi.mock('../../network', () => ({
  getNetworkService: () => networkMocks
}))

function createProvider() {
  return new LocalProvider({
    id: 'local-system-ocr',
    type: IntelligenceProviderType.LOCAL,
    name: 'System OCR',
    enabled: true,
    priority: 0,
    models: ['system-ocr'],
    capabilities: ['vision.ocr'],
    timeout: 30000,
    rateLimit: {}
  })
}

function serializeOwnPropertyGraph(value: unknown): string {
  const seen = new Set<object>()
  const parts: string[] = []

  const visit = (current: unknown): void => {
    if (typeof current === 'string') {
      parts.push(current)
      return
    }
    if (current === null || (typeof current !== 'object' && typeof current !== 'function')) {
      if (current !== undefined) parts.push(String(current))
      return
    }
    if (seen.has(current)) return
    seen.add(current)

    for (const key of Reflect.ownKeys(current)) {
      parts.push(String(key))
      const descriptor = Reflect.getOwnPropertyDescriptor(current, key)
      if (descriptor && 'value' in descriptor) visit(descriptor.value)
    }
  }

  visit(value)
  return parts.join('\n')
}

function createPendingStreamResponse(
  stream: Readable,
  hooks: { onComplete?: () => void; onCancel?: () => void } = {}
) {
  return {
    status: 200,
    statusText: 'OK',
    headers: {},
    url: 'http://localhost:11434/api/chat',
    stream,
    complete: vi.fn(hooks.onComplete),
    cancel: vi.fn(hooks.onCancel)
  }
}

async function settleWithin<T>(
  promise: Promise<T>,
  timeoutMs = 250
): Promise<
  | { status: 'fulfilled'; value: T }
  | { status: 'rejected'; reason: unknown }
  | { status: 'timeout' }
> {
  return await new Promise((resolve) => {
    const timeout = setTimeout(() => resolve({ status: 'timeout' }), timeoutMs)
    promise.then(
      (value) => {
        clearTimeout(timeout)
        resolve({ status: 'fulfilled', value })
      },
      (reason: unknown) => {
        clearTimeout(timeout)
        resolve({ status: 'rejected', reason })
      }
    )
  })
}

describe('LocalProvider.visionOcr', () => {
  it('maps native OCR result into intelligence result', async () => {
    mockedGetNativeOcrSupport.mockReturnValue({
      supported: true,
      platform: 'darwin'
    })
    mockedRecognizeImageText.mockResolvedValue({
      text: 'Hello OCR',
      confidence: 0.88,
      language: 'en',
      blocks: [
        {
          text: 'Hello OCR',
          confidence: 0.88,
          boundingBox: [10, 20, 100, 40]
        }
      ],
      engine: 'apple-vision',
      durationMs: 42
    })

    const provider = createProvider()
    const payload: IntelligenceVisionOcrPayload = {
      source: {
        type: 'base64',
        base64: Buffer.from('fake-image').toString('base64')
      },
      includeLayout: true,
      includeKeywords: true,
      language: 'en'
    }

    const result = await provider.visionOcr(payload, {})

    expect(result.model).toBe('system-ocr')
    expect(result.provider).toBe(IntelligenceProviderType.LOCAL)
    expect(result.result.text).toBe('Hello OCR')
    expect(result.result.engine).toBe('apple-vision')
    expect(result.result.durationMs).toBe(42)
    expect(result.result.blocks?.[0]?.type).toBe('line')
    expect(result.result.keywords).toContain('hello')
    expect(result.usage).toEqual({
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      cost: 0
    })
    expect(mockedRecognizeImageText).toHaveBeenCalledOnce()
  })

  it('throws when native OCR is unavailable', async () => {
    mockedGetNativeOcrSupport.mockReturnValue({
      supported: false,
      platform: 'linux',
      reason: 'platform-not-supported'
    })

    const provider = createProvider()

    await expect(
      provider.visionOcr(
        {
          source: {
            type: 'base64',
            base64: Buffer.from('fake-image').toString('base64')
          }
        },
        {}
      )
    ).rejects.toThrow('Native OCR unavailable')
  })
})

describe('LocalProvider.chat', () => {
  it('streams Ollama /api/chat chunks through the unified network service', async () => {
    networkMocks.requestStream.mockResolvedValueOnce({
      status: 200,
      statusText: 'OK',
      headers: {},
      url: 'http://localhost:11434/api/chat',
      stream: Readable.from([
        '{"message":{"content":"hel"},"done":false}\n',
        '{"message":{"content":"lo"},"done":false}\n',
        '{"done":true,"prompt_eval_count":3,"eval_count":2}\n'
      ]),
      complete: vi.fn(),
      cancel: vi.fn()
    })

    const provider = new LocalProvider({
      id: 'local-default',
      type: IntelligenceProviderType.LOCAL,
      name: 'Local Model',
      enabled: true,
      priority: 3,
      baseUrl: 'http://localhost:11434/v1',
      defaultModel: 'llama3.1:8b',
      models: ['llama3.1:8b']
    })

    const chunks: IntelligenceStreamChunk[] = []
    for await (const chunk of provider.chatStream(
      {
        messages: [{ role: 'user', content: 'ping' }]
      },
      {}
    )) {
      chunks.push(chunk)
    }

    expect(chunks).toEqual([
      { delta: 'hel', done: false },
      { delta: 'lo', done: false },
      {
        delta: '',
        done: true,
        usage: { promptTokens: 3, completionTokens: 2, totalTokens: 5, cost: 0 }
      }
    ])
    expect(networkMocks.requestStream).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        url: 'http://localhost:11434/api/chat',
        proxyOverride: { mode: 'direct' },
        body: expect.objectContaining({
          model: 'llama3.1:8b',
          stream: true
        })
      })
    )
  })

  it('completes an Ollama terminal frame while the physical response body remains open', async () => {
    const body = new PassThrough()
    const lifecycle: string[] = []
    let completed = false
    const response = createPendingStreamResponse(body, {
      onComplete: () => {
        completed = true
        lifecycle.push('complete')
      },
      onCancel: () => {
        lifecycle.push('cancel')
        if (!completed) body.destroy()
      }
    })
    networkMocks.requestStream.mockResolvedValueOnce(response)
    body.write('{"done":true,"prompt_eval_count":3,"eval_count":2}\n')

    const iterator = createProvider().chatStream(
      { messages: [{ role: 'user', content: 'ping' }] },
      {}
    )
    const terminal = await iterator.next()
    lifecycle.push('yield')
    const finalNext = iterator.next()
    const finalOutcome = await settleWithin(finalNext)
    const destroyedBeforeCleanup = body.destroyed
    if (finalOutcome.status === 'timeout') {
      body.destroy()
      await finalNext.catch(() => undefined)
    } else {
      body.destroy()
    }

    expect(terminal).toEqual({
      value: {
        delta: '',
        done: true,
        usage: { promptTokens: 3, completionTokens: 2, totalTokens: 5, cost: 0 }
      },
      done: false
    })
    expect(finalOutcome).toEqual({ status: 'fulfilled', value: { value: undefined, done: true } })
    expect(lifecycle).toEqual(['complete', 'yield', 'cancel'])
    expect(response.complete).toHaveBeenCalledOnce()
    expect(response.cancel).toHaveBeenCalledOnce()
    expect(destroyedBeforeCleanup).toBe(false)
  })

  it('forwards runtime cancellation while waiting for the next Ollama delta', async () => {
    const controller = new AbortController()
    const body = new PassThrough()
    const cancelError = Object.assign(new Error('NETWORK_ABORTED'), { code: 'NETWORK_ABORTED' })
    const response = createPendingStreamResponse(body)
    networkMocks.requestStream.mockImplementationOnce(async (request: { signal?: AbortSignal }) => {
      request.signal?.addEventListener('abort', () => body.destroy(cancelError), { once: true })
      return response
    })
    body.write('{"message":{"content":"partial"},"done":false}\n')

    const iterator = createProvider().chatStream(
      { messages: [{ role: 'user', content: 'ping' }] },
      { signal: controller.signal } as IntelligenceInvokeOptions & { signal: AbortSignal }
    )
    await expect(iterator.next()).resolves.toEqual({
      value: { delta: 'partial', done: false },
      done: false
    })

    const pendingNext = iterator.next()
    controller.abort()
    const outcome = await settleWithin(pendingNext)
    if (outcome.status === 'timeout') {
      body.destroy(cancelError)
      await pendingNext.catch(() => undefined)
    }

    expect(networkMocks.requestStream).toHaveBeenCalledWith(
      expect.objectContaining({ signal: controller.signal })
    )
    expect(outcome.status).toBe('rejected')
    if (outcome.status === 'rejected') expect(outcome.reason).toBe(cancelError)
    expect(response.complete).not.toHaveBeenCalled()
    expect(response.cancel).toHaveBeenCalledOnce()
  })

  it('projects a valid Ollama stream error envelope to a stable model code', async () => {
    networkMocks.requestStream.mockResolvedValueOnce({
      status: 200,
      statusText: 'OK',
      headers: {},
      url: 'http://localhost:11434/api/chat',
      stream: Readable.from([
        `${JSON.stringify({ error: 'unsupported model apiKey=secret under /private/model' })}\n`
      ]),
      complete: vi.fn(),
      cancel: vi.fn()
    })

    const provider = createProvider()
    const iterator = provider.chatStream({ messages: [{ role: 'user', content: 'ping' }] }, {})
    const next = iterator.next()

    const error = await next.catch((cause: unknown) => cause)
    expect(error).toMatchObject({
      code: 'MODEL_UNSUPPORTED',
      message: 'MODEL_UNSUPPORTED'
    })
    expect(serializeOwnPropertyGraph(error)).not.toMatch(/secret|\/private\/model/)
  })

  it('projects a final Ollama error frame without a trailing newline', async () => {
    networkMocks.requestStream.mockResolvedValueOnce({
      status: 200,
      statusText: 'OK',
      headers: {},
      url: 'http://localhost:11434/api/chat',
      stream: Readable.from([
        JSON.stringify({ error: 'unsupported model apiKey=no-newline-secret /private/no-newline' })
      ]),
      complete: vi.fn(),
      cancel: vi.fn()
    })

    const provider = createProvider()
    const iterator = provider.chatStream({ messages: [{ role: 'user', content: 'ping' }] }, {})
    const error = await iterator.next().catch((cause: unknown) => cause)

    expect(error).toMatchObject({
      code: 'MODEL_UNSUPPORTED',
      message: 'MODEL_UNSUPPORTED'
    })
    expect(serializeOwnPropertyGraph(error)).not.toMatch(/no-newline-secret|\/private\/no-newline/)
  })

  it('reconstructs UTF-8 NDJSON deltas split inside CJK and emoji code points', async () => {
    const ndjson = Buffer.from(
      [
        JSON.stringify({ message: { content: '你' }, done: false }),
        JSON.stringify({ message: { content: '好' }, done: false }),
        JSON.stringify({ message: { content: '😀' }, done: false }),
        JSON.stringify({ done: true, prompt_eval_count: 3, eval_count: 2 })
      ].join('\n') + '\n',
      'utf8'
    )
    const firstNewline = ndjson.indexOf(0x0a)
    const boundaries = [
      ndjson.indexOf(Buffer.from('你')) + 1,
      ndjson.indexOf(Buffer.from('好')) + 2,
      ndjson.indexOf(Buffer.from('😀')) + 3,
      firstNewline - 1,
      firstNewline + 2
    ].sort((left, right) => left - right)
    const streamChunks: Buffer[] = []
    let offset = 0

    for (const boundary of boundaries) {
      streamChunks.push(ndjson.subarray(offset, boundary))
      offset = boundary
    }
    streamChunks.push(ndjson.subarray(offset))

    networkMocks.requestStream.mockResolvedValueOnce({
      status: 200,
      statusText: 'OK',
      headers: {},
      url: 'http://localhost:11434/api/chat',
      stream: Readable.from(streamChunks),
      complete: vi.fn(),
      cancel: vi.fn()
    })

    const provider = new LocalProvider({
      id: 'local-default',
      type: IntelligenceProviderType.LOCAL,
      name: 'Local Model',
      enabled: true,
      priority: 3,
      baseUrl: 'http://localhost:11434/v1',
      defaultModel: 'llama3.1:8b',
      models: ['llama3.1:8b']
    })
    const chunks: IntelligenceStreamChunk[] = []

    for await (const chunk of provider.chatStream(
      { messages: [{ role: 'user', content: 'ping' }] },
      {}
    )) {
      chunks.push(chunk)
    }

    expect(chunks).toEqual([
      { delta: '你', done: false },
      { delta: '好', done: false },
      { delta: '😀', done: false },
      {
        delta: '',
        done: true,
        usage: { promptTokens: 3, completionTokens: 2, totalTokens: 5, cost: 0 }
      }
    ])
    expect(chunks.map((chunk) => chunk.delta).join('')).not.toContain('\uFFFD')
    expect(chunks.filter((chunk) => chunk.done)).toHaveLength(1)
  })

  it('preserves a final unterminated done frame delta and usage', async () => {
    networkMocks.requestStream.mockResolvedValueOnce({
      status: 200,
      statusText: 'OK',
      headers: {},
      url: 'http://localhost:11434/api/chat',
      stream: Readable.from([
        Buffer.from(
          JSON.stringify({
            message: { content: '完成😀' },
            done: true,
            prompt_eval_count: 7,
            eval_count: 4
          }),
          'utf8'
        )
      ]),
      complete: vi.fn(),
      cancel: vi.fn()
    })

    const provider = new LocalProvider({
      id: 'local-default',
      type: IntelligenceProviderType.LOCAL,
      name: 'Local Model',
      enabled: true,
      priority: 3,
      baseUrl: 'http://localhost:11434/v1',
      defaultModel: 'llama3.1:8b',
      models: ['llama3.1:8b']
    })
    const chunks: IntelligenceStreamChunk[] = []

    for await (const chunk of provider.chatStream(
      { messages: [{ role: 'user', content: 'ping' }] },
      {}
    )) {
      chunks.push(chunk)
    }

    expect(chunks).toEqual([
      { delta: '完成😀', done: false },
      {
        delta: '',
        done: true,
        usage: { promptTokens: 7, completionTokens: 4, totalTokens: 11, cost: 0 }
      }
    ])
    expect(chunks.filter((chunk) => chunk.done)).toHaveLength(1)
  })

  it('uses Ollama /api/chat through the unified network service', async () => {
    networkMocks.request.mockResolvedValueOnce({
      data: {
        model: 'llama3.1:8b',
        message: { content: 'pong' },
        prompt_eval_count: 3,
        eval_count: 2
      }
    })

    const provider = new LocalProvider({
      id: 'local-default',
      type: IntelligenceProviderType.LOCAL,
      name: 'Local Model',
      enabled: true,
      priority: 3,
      baseUrl: 'http://localhost:11434',
      defaultModel: 'llama3.1:8b',
      models: ['llama3.1:8b']
    })

    const result = await provider.chat(
      {
        messages: [{ role: 'user', content: 'ping' }],
        maxTokens: 12,
        temperature: 0.2
      },
      {}
    )

    expect(result.result).toBe('pong')
    expect(result.model).toBe('llama3.1:8b')
    expect(result.usage).toEqual({
      promptTokens: 3,
      completionTokens: 2,
      totalTokens: 5,
      cost: 0
    })
    expect(networkMocks.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        url: 'http://localhost:11434/api/chat',
        proxyOverride: { mode: 'direct' },
        body: expect.objectContaining({
          model: 'llama3.1:8b',
          stream: false
        })
      })
    )
  })

  it('projects a non-stream Ollama error body without retaining provider text', async () => {
    networkMocks.request.mockResolvedValueOnce({
      data: { error: 'unsupported model apiKey=secret under /private/model' }
    })

    const provider = createProvider()
    const request = provider.chat({ messages: [{ role: 'user', content: 'ping' }] }, {})

    const error = await request.catch((cause: unknown) => cause)
    expect(error).toMatchObject({
      code: 'MODEL_UNSUPPORTED',
      message: 'MODEL_UNSUPPORTED'
    })
    expect(serializeOwnPropertyGraph(error)).not.toMatch(/secret|\/private\/model/)
  })

  it('projects other non-stream Ollama error bodies to a stable request code', async () => {
    networkMocks.request.mockResolvedValueOnce({
      data: { error: 'provider exploded apiKey=generic-secret under /private/generic-model' }
    })

    const provider = createProvider()
    const request = provider.chat({ messages: [{ role: 'user', content: 'ping' }] }, {})
    const error = await request.catch((cause: unknown) => cause)

    expect(error).toMatchObject({
      code: 'OLLAMA_REQUEST_FAILED',
      message: 'OLLAMA_REQUEST_FAILED'
    })
    expect(serializeOwnPropertyGraph(error)).not.toMatch(/generic-secret|\/private\/generic-model/)
  })

  it('marks test-run chat requests as cooldown probes', async () => {
    networkMocks.request.mockResolvedValueOnce({
      data: {
        model: 'llama3.1:8b',
        message: { content: 'pong' }
      }
    })

    const provider = new LocalProvider({
      id: 'local-default',
      type: IntelligenceProviderType.LOCAL,
      name: 'Local Model',
      enabled: true,
      priority: 3,
      baseUrl: 'http://localhost:11434',
      defaultModel: 'llama3.1:8b',
      models: ['llama3.1:8b']
    })

    await provider.chat(
      {
        messages: [{ role: 'user', content: 'ping' }]
      },
      { testRun: true }
    )

    expect(networkMocks.request).toHaveBeenCalledWith(
      expect.objectContaining({
        cooldownPolicy: expect.objectContaining({
          key: 'local-default:ollama.chat'
        }),
        skipCooldownCheck: true
      })
    )
  })
})

describe('LocalProvider fallback behavior', () => {
  let compatibilitySpy: { mockRestore: () => void } | undefined

  afterEach(() => {
    compatibilitySpy?.mockRestore()
    compatibilitySpy = undefined
  })

  it('returns compatibility chunks when Ollama returns 404 before emitting output', async () => {
    const compatibilityChunks: IntelligenceStreamChunk[] = [
      { delta: 'compatible answer', done: false },
      {
        delta: '',
        done: true,
        usage: { promptTokens: 3, completionTokens: 2, totalTokens: 5, cost: 1 }
      }
    ]
    compatibilitySpy = vi
      .spyOn(OpenAiCompatibleLangChainProvider.prototype, 'chatStream')
      .mockImplementation(async function* () {
        yield* compatibilityChunks
      })
    networkMocks.requestStream.mockRejectedValueOnce(
      new NetworkHttpStatusError(404, 'Not Found', 'http://localhost:11434/api/chat')
    )

    const provider = createProvider()
    const chunks: IntelligenceStreamChunk[] = []

    for await (const chunk of provider.chatStream(
      { messages: [{ role: 'user', content: 'ping' }] },
      {}
    )) {
      chunks.push(chunk)
    }

    expect(chunks).toEqual([
      { delta: 'compatible answer', done: false },
      {
        delta: '',
        done: true,
        usage: { promptTokens: 3, completionTokens: 2, totalTokens: 5, cost: 0 }
      }
    ])
    expect(compatibilitySpy).toHaveBeenCalledOnce()
  })

  it('propagates the original 404 after an Ollama delta without compatibility output', async () => {
    const streamError = new NetworkHttpStatusError(
      404,
      'Not Found',
      'http://localhost:11434/api/chat'
    )
    const compatibilityChunks: IntelligenceStreamChunk[] = [
      { delta: 'compatible answer', done: false },
      { delta: '', done: true }
    ]
    compatibilitySpy = vi
      .spyOn(OpenAiCompatibleLangChainProvider.prototype, 'chatStream')
      .mockImplementation(async function* () {
        yield* compatibilityChunks
      })
    networkMocks.requestStream.mockResolvedValueOnce({
      status: 200,
      statusText: 'OK',
      headers: {},
      url: 'http://localhost:11434/api/chat',
      stream: Readable.from(
        (async function* () {
          yield '{"message":{"content":"Ollama output"},"done":false}\n'
          throw streamError
        })()
      ),
      complete: vi.fn(),
      cancel: vi.fn()
    })

    const provider = createProvider()
    const iterator = provider.chatStream({ messages: [{ role: 'user', content: 'ping' }] }, {})

    await expect(iterator.next()).resolves.toEqual({
      value: { delta: 'Ollama output', done: false },
      done: false
    })
    await expect(iterator.next()).rejects.toBe(streamError)
    expect(compatibilitySpy).not.toHaveBeenCalled()
  })

  it('projects an Ollama error frame after a delta without compatibility fallback', async () => {
    compatibilitySpy = vi
      .spyOn(OpenAiCompatibleLangChainProvider.prototype, 'chatStream')
      .mockImplementation(async function* () {
        yield { delta: 'compatible answer', done: false }
      })
    networkMocks.requestStream.mockResolvedValueOnce({
      status: 200,
      statusText: 'OK',
      headers: {},
      url: 'http://localhost:11434/api/chat',
      stream: Readable.from([
        '{"message":{"content":"Ollama output"},"done":false}\n',
        `${JSON.stringify({ error: 'provider failed apiKey=post-delta-secret /private/post-delta' })}\n`
      ]),
      complete: vi.fn(),
      cancel: vi.fn()
    })

    const provider = createProvider()
    const iterator = provider.chatStream({ messages: [{ role: 'user', content: 'ping' }] }, {})

    await expect(iterator.next()).resolves.toEqual({
      value: { delta: 'Ollama output', done: false },
      done: false
    })
    const error = await iterator.next().catch((cause: unknown) => cause)
    expect(error).toMatchObject({
      code: 'OLLAMA_REQUEST_FAILED',
      message: 'OLLAMA_REQUEST_FAILED'
    })
    expect(serializeOwnPropertyGraph(error)).not.toMatch(/post-delta-secret|\/private\/post-delta/)
    expect(compatibilitySpy).not.toHaveBeenCalled()
  })

  it('propagates a generic error mentioning 404 before output without compatibility fallback', async () => {
    const parseError = new Error('parse failed at position 404')
    compatibilitySpy = vi
      .spyOn(OpenAiCompatibleLangChainProvider.prototype, 'chatStream')
      .mockImplementation(async function* () {
        yield { delta: 'compatible answer', done: false }
      })
    networkMocks.requestStream.mockRejectedValueOnce(parseError)

    const provider = createProvider()
    const iterator = provider.chatStream({ messages: [{ role: 'user', content: 'ping' }] }, {})

    await expect(iterator.next()).rejects.toBe(parseError)
    expect(compatibilitySpy).not.toHaveBeenCalled()
  })

  it('returns compatibility output when Ollama returns a typed HTTP 404', async () => {
    const compatibilityResult = {
      result: 'compatible answer',
      usage: { promptTokens: 3, completionTokens: 2, totalTokens: 5, cost: 1 },
      model: 'compatible-model',
      latency: 12,
      traceId: 'compatible-trace',
      provider: IntelligenceProviderType.LOCAL
    }
    compatibilitySpy = vi
      .spyOn(OpenAiCompatibleLangChainProvider.prototype, 'chat')
      .mockResolvedValue(compatibilityResult)
    networkMocks.request.mockRejectedValueOnce(
      new NetworkHttpStatusError(404, 'Not Found', 'http://localhost:11434/api/chat')
    )

    const provider = createProvider()

    await expect(
      provider.chat({ messages: [{ role: 'user', content: 'ping' }] }, {})
    ).resolves.toEqual({
      ...compatibilityResult,
      usage: { promptTokens: 3, completionTokens: 2, totalTokens: 5, cost: 0 }
    })
    expect(compatibilitySpy).toHaveBeenCalledOnce()
  })

  it('propagates a generic non-stream error mentioning 404 without compatibility fallback', async () => {
    const parseError = new Error('parse failed at position 404')
    compatibilitySpy = vi
      .spyOn(OpenAiCompatibleLangChainProvider.prototype, 'chat')
      .mockResolvedValue({
        result: 'compatible answer',
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        model: 'compatible-model',
        latency: 0,
        traceId: 'compatible-trace',
        provider: IntelligenceProviderType.LOCAL
      })
    networkMocks.request.mockRejectedValueOnce(parseError)

    const provider = createProvider()

    await expect(provider.chat({ messages: [{ role: 'user', content: 'ping' }] }, {})).rejects.toBe(
      parseError
    )
    expect(compatibilitySpy).not.toHaveBeenCalled()
  })
})
