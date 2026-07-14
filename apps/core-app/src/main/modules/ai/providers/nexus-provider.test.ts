import type { IntelligenceStreamChunk } from '@talex-touch/tuff-intelligence'
import { Readable } from 'node:stream'
import { IntelligenceProviderType } from '@talex-touch/tuff-intelligence'
import { NetworkHttpStatusError } from '@talex-touch/utils/network'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { isNexusProviderConfig, NexusProvider } from './nexus-provider'

const networkMocks = vi.hoisted(() => ({
  request: vi.fn(),
  requestStream: vi.fn(),
}))

const sceneMocks = vi.hoisted(() => ({
  runNexusScene: vi.fn(),
  extractTranslatedImageFromSceneRun: vi.fn(),
}))

vi.mock('../../network', () => ({
  getNetworkService: () => networkMocks,
}))

vi.mock('../../nexus/runtime-base', () => ({
  getRuntimeNexusBaseUrl: () => 'https://nexus.example.com',
}))

vi.mock('../../nexus/scene-client', () => ({
  runNexusScene: sceneMocks.runNexusScene,
  extractTranslatedImageFromSceneRun: sceneMocks.extractTranslatedImageFromSceneRun,
}))

describe('nexusProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    networkMocks.request.mockResolvedValue({
      data: {
        invocation: {
          capabilityId: 'text.chat',
          result: 'hello',
          usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
          model: 'gpt-4o-mini',
          latency: 42,
          traceId: 'trace_nexus_1',
          provider: 'ip_nexus_ai',
        },
      },
    })
    sceneMocks.runNexusScene.mockResolvedValue({
      runId: 'run_image_1',
      sceneId: 'corebox.screenshot.translate',
      status: 'completed',
      mode: 'execute',
      output: {},
    })
    sceneMocks.extractTranslatedImageFromSceneRun.mockReturnValue({
      translatedImageBase64: 'dHJhbnNsYXRlZA==',
      imageMimeType: 'image/png',
      sourceText: 'hello',
      targetText: '你好',
      overlay: { blocks: [] },
    })
  })

  it('识别默认 Tuff Nexus provider 配置', () => {
    expect(isNexusProviderConfig({ id: 'tuff-nexus-default' })).toBe(true)
    expect(isNexusProviderConfig({ metadata: { origin: 'tuff-nexus' } })).toBe(true)
    expect(isNexusProviderConfig({ id: 'custom-openai' })).toBe(false)
  })

  it('使用 app bearer token 调用 Nexus intelligence invoke API', async () => {
    const provider = new NexusProvider({
      id: 'tuff-nexus-default',
      type: IntelligenceProviderType.CUSTOM,
      name: 'Tuff Nexus',
      enabled: true,
      apiKey: 'app-token',
      defaultModel: 'gpt-4o-mini',
      priority: 1,
      metadata: { origin: 'tuff-nexus', tokenMode: 'auth' },
    })

    const result = await provider.chat(
      { messages: [{ role: 'user', content: 'hi' }] },
      { timeout: 12_000, metadata: { capabilityId: 'text.chat' } },
    )

    expect(networkMocks.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        url: 'https://nexus.example.com/api/v1/intelligence/invoke',
        headers: expect.objectContaining({
          'Authorization': 'Bearer app-token',
          'Content-Type': 'application/json',
        }),
        body: expect.objectContaining({
          capabilityId: 'text.chat',
          payload: {
            messages: [{ role: 'user', content: 'hi' }],
          },
        }),
        captureErrorResponseData: true,
        timeoutMs: 12_000,
      }),
    )
    expect(result).toMatchObject({
      result: 'hello',
      usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
      model: 'gpt-4o-mini',
      traceId: 'trace_nexus_1',
      provider: 'ip_nexus_ai',
    })
  })

  it('rethrows canonical Nexus invoke failures from the H3 response body', async () => {
    const upstreamError = new NetworkHttpStatusError(
      429,
      'Too Many Requests',
      'https://nexus.example.com/api/v1/intelligence/invoke',
      {
        statusCode: 429,
        statusMessage: 'Too Many Requests',
        data: {
          code: 'QUOTA_EXHAUSTED',
          message: 'Provider quota has been exhausted.',
          reason: 'The caller has exhausted its request, token, or cost quota.',
          recovery: 'Wait for quota reset, lower token usage, or adjust quota settings.',
        },
      },
    )
    networkMocks.request.mockRejectedValueOnce(upstreamError)
    const provider = new NexusProvider({
      id: 'tuff-nexus-default',
      type: IntelligenceProviderType.CUSTOM,
      name: 'Tuff Nexus',
      enabled: true,
      apiKey: 'app-token',
      priority: 1,
      metadata: { origin: 'tuff-nexus', tokenMode: 'auth' },
    })

    const thrown = await provider
      .chat({ messages: [{ role: 'user', content: 'hi' }] }, {})
      .catch((error: unknown) => error)

    expect(thrown).toBeInstanceOf(Error)
    expect(thrown).not.toBe(upstreamError)
    expect(thrown).not.toBeInstanceOf(NetworkHttpStatusError)
    expect(thrown).toMatchObject({
      code: 'QUOTA_EXHAUSTED',
      message: 'Provider quota has been exhausted.',
      reason: 'The caller has exhausted its request, token, or cost quota.',
      recovery: 'Wait for quota reset, lower token usage, or adjust quota settings.',
    })
  })

  it('retains the original HTTP error for malformed legacy Nexus invoke response data', async () => {
    const upstreamError = new NetworkHttpStatusError(
      503,
      'Service Unavailable',
      'https://nexus.example.com/api/v1/intelligence/invoke',
      {
        statusCode: 503,
        statusMessage: 'Service Unavailable',
        data: {
          message: 'Legacy provider failure without a canonical code.',
        },
      },
    )
    networkMocks.request.mockRejectedValueOnce(upstreamError)
    const provider = new NexusProvider({
      id: 'tuff-nexus-default',
      type: IntelligenceProviderType.CUSTOM,
      name: 'Tuff Nexus',
      enabled: true,
      apiKey: 'app-token',
      priority: 1,
      metadata: { origin: 'tuff-nexus', tokenMode: 'auth' },
    })

    await expect(provider.chat({ messages: [{ role: 'user', content: 'hi' }] }, {})).rejects.toBe(
      upstreamError,
    )
    expect(upstreamError.status).toBe(503)
  })

  it('streams token deltas from split UTF-8 SSE frames and emits terminal usage once', async () => {
    const sse = [
      ': keepalive',
      '',
      'event: start',
      'data: {"type":"start","traceId":"trace_nexus_stream_1","provider":"ip_nexus_ai","model":"gpt-4o-mini","latency":42}',
      '',
      'event: delta',
      'data: {"type":"delta","delta":"Hel"}',
      '',
      'event: unknown',
      'data: {"type":"unknown","ignored":true}',
      '',
      'event: delta',
      'data: {"type":"delta","delta":"你"}',
      '',
      'event: delta',
      'data: {"type":"delta","delta":"!"}',
      '',
      'event: usage',
      'data: {"type":"usage","usage":{"promptTokens":1,"completionTokens":3,"totalTokens":4}}',
      '',
      'event: end',
      'data: {"type":"end"}',
      '',
    ].join('\n')
    const encoded = new TextEncoder().encode(sse)
    const utf8Offset = sse.indexOf('你')
    networkMocks.requestStream.mockResolvedValueOnce({
      status: 200,
      statusText: 'OK',
      headers: { 'content-type': 'text/event-stream' },
      url: 'https://nexus.example.com/api/v1/intelligence/stream',
      stream: Readable.from([
        encoded.subarray(0, utf8Offset + 1),
        encoded.subarray(utf8Offset + 1, utf8Offset + 2),
        encoded.subarray(utf8Offset + 2),
      ]),
    })
    const provider = new NexusProvider({
      id: 'tuff-nexus-default',
      type: IntelligenceProviderType.CUSTOM,
      name: 'Tuff Nexus',
      enabled: true,
      apiKey: 'app-token',
      defaultModel: 'configured-chat-model',
      priority: 1,
      metadata: { origin: 'tuff-nexus', tokenMode: 'auth' },
    })

    const chunks: IntelligenceStreamChunk[] = []
    for await (const chunk of provider.chatStream(
      { messages: [{ role: 'user', content: 'hi' }] },
      { timeout: 12_000, metadata: { capabilityId: 'text.chat' } },
    )) {
      chunks.push(chunk)
    }

    expect(chunks).toEqual([
      {
        delta: 'Hel',
        done: false,
        traceId: 'trace_nexus_stream_1',
        provider: 'ip_nexus_ai',
        model: 'gpt-4o-mini',
        latency: 42,
      },
      {
        delta: '你',
        done: false,
        traceId: 'trace_nexus_stream_1',
        provider: 'ip_nexus_ai',
        model: 'gpt-4o-mini',
        latency: 42,
      },
      {
        delta: '!',
        done: false,
        traceId: 'trace_nexus_stream_1',
        provider: 'ip_nexus_ai',
        model: 'gpt-4o-mini',
        latency: 42,
      },
      {
        delta: '',
        done: true,
        usage: { promptTokens: 1, completionTokens: 3, totalTokens: 4 },
        traceId: 'trace_nexus_stream_1',
        provider: 'ip_nexus_ai',
        model: 'gpt-4o-mini',
        latency: 42,
      },
    ])
    expect(networkMocks.request).not.toHaveBeenCalled()
    expect(networkMocks.requestStream).toHaveBeenCalledOnce()
    expect(networkMocks.requestStream).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        url: 'https://nexus.example.com/api/v1/intelligence/stream',
        headers: expect.objectContaining({
          'Authorization': 'Bearer app-token',
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream',
        }),
        body: expect.objectContaining({
          capabilityId: 'text.chat',
          payload: { messages: [{ role: 'user', content: 'hi' }] },
        }),
        timeoutMs: 12_000,
      }),
    )
  })

  it('retains a structured Nexus SSE error before any delta', async () => {
    const sse = [
      'event: error',
      'data: {"type":"error","message":"Provider quota has been exhausted.","code":"QUOTA_EXHAUSTED","reason":"The caller has exhausted its request, token, or cost quota.","recovery":"Wait for quota reset, lower token usage, or adjust quota settings."}',
      '',
      '',
    ].join('\n')
    const encoded = new TextEncoder().encode(sse)
    const fieldOffset = sse.indexOf('"reason"')
    networkMocks.requestStream.mockResolvedValueOnce({
      status: 200,
      statusText: 'OK',
      headers: { 'content-type': 'text/event-stream' },
      url: 'https://nexus.example.com/api/v1/intelligence/stream',
      stream: Readable.from([
        encoded.subarray(0, fieldOffset),
        encoded.subarray(fieldOffset, fieldOffset + 9),
        encoded.subarray(fieldOffset + 9),
      ]),
    })
    const provider = new NexusProvider({
      id: 'tuff-nexus-default',
      type: IntelligenceProviderType.CUSTOM,
      name: 'Tuff Nexus',
      enabled: true,
      apiKey: 'app-token',
      priority: 1,
      metadata: { origin: 'tuff-nexus', tokenMode: 'auth' },
    })

    await expect(provider.chatStream({ messages: [{ role: 'user', content: 'hi' }] }, {}).next())
      .rejects
      .toMatchObject({
        message: 'Provider quota has been exhausted.',
        code: 'QUOTA_EXHAUSTED',
        reason: 'The caller has exhausted its request, token, or cost quota.',
        recovery: 'Wait for quota reset, lower token usage, or adjust quota settings.',
      })
    expect(networkMocks.request).not.toHaveBeenCalled()
    expect(networkMocks.requestStream).toHaveBeenCalledOnce()
  })

  it('retains a structured Nexus SSE error after yielding a visible delta', async () => {
    const sse = [
      'event: delta',
      'data: {"type":"delta","delta":"Visible answer"}',
      '',
      'event: error',
      'data: {"type":"error","message":"Quota verification is temporarily unavailable.","code":"QUOTA_CHECK_UNAVAILABLE","reason":"Quota verification is unavailable, so the request was blocked.","recovery":"Retry after quota storage recovers or inspect Intelligence quota configuration."}',
      '',
      '',
    ].join('\n')
    const encoded = new TextEncoder().encode(sse)
    const errorOffset = sse.indexOf('event: error')
    networkMocks.requestStream.mockResolvedValueOnce({
      status: 200,
      statusText: 'OK',
      headers: { 'content-type': 'text/event-stream' },
      url: 'https://nexus.example.com/api/v1/intelligence/stream',
      stream: Readable.from([
        encoded.subarray(0, errorOffset + 18),
        encoded.subarray(errorOffset + 18),
      ]),
    })
    const provider = new NexusProvider({
      id: 'tuff-nexus-default',
      type: IntelligenceProviderType.CUSTOM,
      name: 'Tuff Nexus',
      enabled: true,
      apiKey: 'app-token',
      priority: 1,
      metadata: { origin: 'tuff-nexus', tokenMode: 'auth' },
    })
    const stream = provider.chatStream({ messages: [{ role: 'user', content: 'hi' }] }, {})

    await expect(stream.next()).resolves.toMatchObject({
      value: { delta: 'Visible answer', done: false },
      done: false,
    })
    await expect(stream.next()).rejects.toMatchObject({
      message: 'Quota verification is temporarily unavailable.',
      code: 'QUOTA_CHECK_UNAVAILABLE',
      reason: 'Quota verification is unavailable, so the request was blocked.',
      recovery: 'Retry after quota storage recovers or inspect Intelligence quota configuration.',
    })
    expect(networkMocks.request).not.toHaveBeenCalled()
    expect(networkMocks.requestStream).toHaveBeenCalledOnce()
  })

  it('preserves a legacy message-only Nexus SSE error without fabricating a canonical code', async () => {
    const sse = 'event: error\ndata: {"type":"error","message":"upstream unavailable"}\n\n'
    const encoded = new TextEncoder().encode(sse)
    networkMocks.requestStream.mockResolvedValueOnce({
      status: 200,
      statusText: 'OK',
      headers: { 'content-type': 'text/event-stream' },
      url: 'https://nexus.example.com/api/v1/intelligence/stream',
      stream: Readable.from([encoded.subarray(0, 29), encoded.subarray(29)]),
    })
    const provider = new NexusProvider({
      id: 'tuff-nexus-default',
      type: IntelligenceProviderType.CUSTOM,
      name: 'Tuff Nexus',
      enabled: true,
      apiKey: 'app-token',
      priority: 1,
      metadata: { origin: 'tuff-nexus', tokenMode: 'auth' },
    })
    const stream = provider.chatStream({ messages: [{ role: 'user', content: 'hi' }] }, {})
    let thrown: unknown

    try {
      await stream.next()
    }
    catch (error) {
      thrown = error
    }

    expect(thrown).toBeInstanceOf(Error)
    expect(thrown).toMatchObject({ message: 'upstream unavailable' })
    expect(thrown).not.toHaveProperty('code')
    expect(networkMocks.request).not.toHaveBeenCalled()
    expect(networkMocks.requestStream).toHaveBeenCalledOnce()
  })

  it('blocks guest chat before any Nexus request with canonical auth recovery', async () => {
    const provider = new NexusProvider({
      id: 'tuff-nexus-default',
      type: IntelligenceProviderType.CUSTOM,
      name: 'Tuff Nexus',
      enabled: true,
      apiKey: 'guest',
      priority: 1,
      metadata: { origin: 'tuff-nexus', tokenMode: 'auth' },
    })

    const thrown = await provider
      .chat({ messages: [{ role: 'user', content: 'hi' }] }, {})
      .catch((error: unknown) => error)

    expect(thrown).toBeInstanceOf(Error)
    expect(thrown).toMatchObject({
      message: 'NEXUS_AUTH_REQUIRED',
      code: 'NEXUS_AUTH_REQUIRED',
      reason: 'Nexus provider requires a signed-in account.',
      recovery: 'Sign in to Nexus or switch to another enabled provider.',
    })
    expect(networkMocks.request).not.toHaveBeenCalled()
    expect(networkMocks.requestStream).not.toHaveBeenCalled()
  })

  it('blocks tokenMode guest chat streaming before any Nexus request with canonical auth recovery', async () => {
    const provider = new NexusProvider({
      id: 'tuff-nexus-default',
      type: IntelligenceProviderType.CUSTOM,
      name: 'Tuff Nexus',
      enabled: true,
      apiKey: 'app-token',
      priority: 1,
      metadata: { origin: 'tuff-nexus', tokenMode: 'guest' },
    })

    const thrown = await provider
      .chatStream({ messages: [{ role: 'user', content: 'hi' }] }, {})
      .next()
      .catch((error: unknown) => error)

    expect(thrown).toBeInstanceOf(Error)
    expect(thrown).toMatchObject({
      message: 'NEXUS_AUTH_REQUIRED',
      code: 'NEXUS_AUTH_REQUIRED',
      reason: 'Nexus provider requires a signed-in account.',
      recovery: 'Sign in to Nexus or switch to another enabled provider.',
    })
    expect(networkMocks.request).not.toHaveBeenCalled()
    expect(networkMocks.requestStream).not.toHaveBeenCalled()
  })

  it('通过 Nexus scene 执行端到端图片翻译', async () => {
    const provider = new NexusProvider({
      id: 'tuff-nexus-default',
      type: IntelligenceProviderType.CUSTOM,
      name: 'Tuff Nexus',
      enabled: true,
      apiKey: 'app-token',
      defaultModel: 'nexus-image',
      priority: 1,
      metadata: { origin: 'tuff-nexus', tokenMode: 'auth' },
    })

    const result = await provider.imageTranslateE2e(
      {
        imageBase64: 'aW1hZ2U=',
        imageMimeType: 'image/png',
        targetLang: 'zh',
        sourceLang: 'en',
      },
      { timeout: 15_000, preferredProviderId: 'tencent-image' },
    )

    expect(sceneMocks.runNexusScene).toHaveBeenCalledWith('corebox.screenshot.translate', {
      input: {
        imageBase64: 'aW1hZ2U=',
        targetLang: 'zh',
        sourceLang: 'en',
        imageMimeType: 'image/png',
      },
      capability: 'image.translate.e2e',
      providerId: 'tencent-image',
      timeoutMs: 15_000,
    })
    expect(result).toMatchObject({
      result: {
        translatedImageBase64: 'dHJhbnNsYXRlZA==',
        imageMimeType: 'image/png',
        sourceText: 'hello',
        targetText: '你好',
        overlay: { blocks: [] },
      },
      model: 'nexus-image',
      traceId: 'run_image_1',
      provider: 'tuff-nexus-default',
    })
  })
})
