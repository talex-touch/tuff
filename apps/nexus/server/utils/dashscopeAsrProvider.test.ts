import { Buffer } from 'node:buffer'
import { IncomingMessage, ServerResponse } from 'node:http'
import { Socket } from 'node:net'
import { H3Event, type H3Event as H3EventType } from 'h3'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createDashScopeQwenAudioAsrAdapter,
  DashScopeAsrError,
  QWEN_AUDIO_ASR_MAX_DURATION_SECONDS,
  QWEN_AUDIO_ASR_MODEL,
} from './dashscopeAsrProvider'
import type { ProviderCredentialPayload } from './providerCredentialStore'
import type { ProviderRegistryRecord } from './providerRegistryStore'

const testApiKey = 'test-dashscope-api-key-must-not-escape'

const credentialMocks = vi.hoisted(() => ({
  getProviderCredential: vi.fn<(event: H3EventType, authRef: string) => Promise<ProviderCredentialPayload | null>>(),
}))

vi.mock('./providerCredentialStore', () => credentialMocks)

function createEvent(): H3EventType {
  const request = new IncomingMessage(new Socket())
  const response = new ServerResponse(request)
  return new H3Event(request, response)
}

function dashScopeProvider(overrides: Partial<ProviderRegistryRecord> = {}): ProviderRegistryRecord {
  return {
    id: 'dashscope-asr',
    name: 'dashscope-asr',
    displayName: 'DashScope ASR',
    vendor: 'dashscope',
    status: 'enabled',
    authType: 'api_key',
    authRef: 'secure://providers/dashscope-asr',
    ownerScope: 'system',
    ownerId: null,
    description: null,
    endpoint: 'https://dashscope.example.com/api/v1',
    region: null,
    metadata: null,
    capabilities: [],
    createdBy: 'test',
    createdAt: '2026-09-08T00:00:00.000Z',
    updatedAt: '2026-09-08T00:00:00.000Z',
    ...overrides,
  }
}

async function expectDashScopeError(
  operation: () => Promise<unknown>,
  expected: Pick<DashScopeAsrError, 'code' | 'accepted'>,
) {
  await operation().then(
    () => {
      throw new Error('Expected the DashScope adapter to reject.')
    },
    (error: unknown) => {
      expect(error).toBeInstanceOf(DashScopeAsrError)
      if (!(error instanceof DashScopeAsrError)) return
      expect(error.code).toBe(expected.code)
      expect(error.accepted).toBe(expected.accepted)
      expect(error.message).toBe(expected.code)
      expect(error.stack ?? '').not.toContain(testApiKey)
    },
  )
}

function pcmWav(dataBytes: number): Buffer {
  const audio = Buffer.alloc(44 + dataBytes)
  audio.write('RIFF', 0, 'ascii')
  audio.writeUInt32LE(36 + dataBytes, 4)
  audio.write('WAVE', 8, 'ascii')
  audio.write('fmt ', 12, 'ascii')
  audio.writeUInt32LE(16, 16)
  audio.writeUInt16LE(1, 20)
  audio.writeUInt16LE(1, 22)
  audio.writeUInt32LE(8_000, 24)
  audio.writeUInt32LE(16_000, 28)
  audio.writeUInt16LE(2, 32)
  audio.writeUInt16LE(16, 34)
  audio.write('data', 36, 'ascii')
  audio.writeUInt32LE(dataBytes, 40)
  return audio
}

interface QwenRequest {
  method: string
  url: string
  headers: Headers
  body: string
}

function qwenFetch(requests: QwenRequest[], payload: unknown, status = 200): typeof fetch {
  return async (input, init) => {
    requests.push({
      method: init?.method ?? 'GET',
      url: String(input),
      headers: new Headers(init?.headers),
      body: typeof init?.body === 'string' ? init.body : '',
    })
    return new Response(JSON.stringify(payload), { status })
  }
}

/**
 * The contract these boundaries share: an adapter that cannot build a valid request must fail
 * closed before it resolves a provider credential or opens a socket. Resolving the secret first
 * would leak a store read — and, for accepted-uncertain transport failures, invite a replay of a
 * request that was never safe to send.
 */
describe('DashScope Qwen Audio Flash adapter pre-flight boundaries', () => {
  beforeEach(() => {
    credentialMocks.getProviderCredential.mockReset()
    credentialMocks.getProviderCredential.mockResolvedValue({ apiKey: testApiKey })
  })

  it.each([
    {
      name: 'a model override that is not the synchronous model',
      audio: () => Buffer.from('synthetic-pcm-audio-bytes'),
      options: { durationSeconds: 1, model: 'qwen-audio-3.0-asr-flash-filetrans' },
      adapterOptions: {},
      code: 'ASR_PROVIDER_CONFIGURATION_INVALID',
    },
    {
      name: 'audio past the Data URI cap',
      audio: () => Buffer.alloc(100, 0x41),
      options: { durationSeconds: 1 },
      adapterOptions: { maxDataUriBytes: 128 },
      code: 'ASR_AUDIO_TOO_LARGE',
    },
    {
      name: 'a duration beyond the synchronous ceiling',
      audio: () => Buffer.from('synthetic-pcm-audio-bytes'),
      options: { durationSeconds: QWEN_AUDIO_ASR_MAX_DURATION_SECONDS + 1 },
      adapterOptions: {},
      code: 'ASR_PROVIDER_CONFIGURATION_INVALID',
    },
  ] as const)('refuses $name without resolving a credential or calling the provider', async ({
    audio,
    options,
    adapterOptions,
    code,
  }) => {
    const fetcher = vi.fn<typeof fetch>()

    await expectDashScopeError(
      () =>
        createDashScopeQwenAudioAsrAdapter({ fetch: fetcher, ...adapterOptions }).transcribe(
          createEvent(),
          dashScopeProvider(),
          audio(),
          options,
        ),
      { code, accepted: false },
    )

    expect(credentialMocks.getProviderCredential).not.toHaveBeenCalled()
    expect(fetcher).not.toHaveBeenCalled()
  })

  it.each([
    { name: 'a provider for another vendor', provider: () => dashScopeProvider({ vendor: 'openai' }) },
    { name: 'a disabled provider', provider: () => dashScopeProvider({ status: 'disabled' }) },
    { name: 'a provider that does not authenticate by API key', provider: () => dashScopeProvider({ authType: 'secret_pair' }) },
    { name: 'a provider without a credential reference', provider: () => dashScopeProvider({ authRef: null }) },
    { name: 'a provider without an endpoint', provider: () => dashScopeProvider({ endpoint: null }) },
    {
      name: 'an insecure endpoint',
      provider: () => dashScopeProvider({ endpoint: 'http://dashscope.example.com/api/v1' }),
    },
    {
      name: 'an endpoint without the /api/v1 suffix',
      provider: () => dashScopeProvider({ endpoint: 'https://dashscope.example.com/v1' }),
    },
    {
      name: 'an endpoint carrying a query string',
      provider: () => dashScopeProvider({ endpoint: 'https://dashscope.example.com/api/v1?token=1' }),
    },
    {
      name: 'an endpoint carrying credentials',
      provider: () => dashScopeProvider({ endpoint: 'https://user:pass@dashscope.example.com/api/v1' }),
    },
  ])('refuses $name before touching the credential store or the network', async ({ provider }) => {
    const fetcher = vi.fn<typeof fetch>()

    await expectDashScopeError(
      () =>
        createDashScopeQwenAudioAsrAdapter({ fetch: fetcher }).transcribe(
          createEvent(),
          provider(),
          Buffer.from('synthetic-pcm-audio-bytes'),
          { durationSeconds: 1 },
        ),
      { code: 'ASR_PROVIDER_CONFIGURATION_INVALID', accepted: false },
    )

    expect(credentialMocks.getProviderCredential).not.toHaveBeenCalled()
    expect(fetcher).not.toHaveBeenCalled()
  })

  it.each([
    { name: 'the credential is missing', credential: null },
    { name: 'the credential has a blank API key', credential: { apiKey: '   ' } as ProviderCredentialPayload },
  ])('fails closed when $name instead of sending an unauthenticated request', async ({ credential }) => {
    credentialMocks.getProviderCredential.mockResolvedValue(credential)
    const fetcher = vi.fn<typeof fetch>()

    await expectDashScopeError(
      () =>
        createDashScopeQwenAudioAsrAdapter({ fetch: fetcher }).transcribe(
          createEvent(),
          dashScopeProvider(),
          Buffer.from('synthetic-pcm-audio-bytes'),
          { durationSeconds: 1 },
        ),
      { code: 'ASR_PROVIDER_CONFIGURATION_INVALID', accepted: false },
    )

    expect(fetcher).not.toHaveBeenCalled()
  })
})

describe('DashScope Qwen Audio Flash adapter transport uncertainty', () => {
  beforeEach(() => {
    credentialMocks.getProviderCredential.mockReset()
    credentialMocks.getProviderCredential.mockResolvedValue({ apiKey: testApiKey })
  })

  it('forwards the caller signal and maps an abort to accepted-uncertain so the request is never replayed', async () => {
    const controller = new AbortController()
    controller.abort()
    const aborted = Object.assign(new Error('This operation was aborted'), { name: 'AbortError' })
    const fetcher = vi.fn<typeof fetch>(async (_input, init) => {
      if (init?.signal?.aborted) throw aborted
      return new Response(JSON.stringify({ output: { text: 'the request was not aborted' } }), { status: 200 })
    })

    await expectDashScopeError(
      () =>
        createDashScopeQwenAudioAsrAdapter({ fetch: fetcher }).transcribe(
          createEvent(),
          dashScopeProvider(),
          Buffer.from('synthetic-pcm-audio-bytes'),
          { durationSeconds: 1, signal: controller.signal },
        ),
      { code: 'ASR_PROVIDER_UNAVAILABLE', accepted: true },
    )

    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('aborts an unresponsive provider at the adapter-owned deadline', async () => {
    let observedSignal: AbortSignal | null = null
    const fetcher = vi.fn<typeof fetch>(async (_input, init) => {
      observedSignal = init?.signal ?? null
      return await new Promise<Response>((_resolve, reject) => {
        if (!observedSignal) {
          reject(new Error('request signal missing'))
          return
        }
        observedSignal.addEventListener('abort', () => reject(new Error('deadline reached')), {
          once: true,
        })
      })
    })

    await expectDashScopeError(
      () =>
        createDashScopeQwenAudioAsrAdapter({ fetch: fetcher, requestTimeoutMs: 5 }).transcribe(
          createEvent(),
          dashScopeProvider(),
          Buffer.from('synthetic-pcm-audio-bytes'),
          { durationSeconds: 1 },
        ),
      { code: 'ASR_PROVIDER_UNAVAILABLE', accepted: true },
    )

    expect(observedSignal?.aborted).toBe(true)
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it.each([
    { name: 'a non-JSON body', body: '<html>upstream gateway</html>', contentType: 'text/html' },
    { name: 'a JSON array body', body: '[]', contentType: 'application/json' },
    { name: 'a transcript that is not a string', body: JSON.stringify({ output: { text: 42 } }), contentType: 'application/json' },
  ])('maps a 200 response with $name to accepted-uncertain without replaying the request', async ({ body, contentType }) => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response(body, { status: 200, headers: { 'content-type': contentType } }))

    await expectDashScopeError(
      () =>
        createDashScopeQwenAudioAsrAdapter({ fetch: fetcher }).transcribe(
          createEvent(),
          dashScopeProvider(),
          Buffer.from('synthetic-pcm-audio-bytes'),
          { durationSeconds: 1 },
        ),
      { code: 'ASR_PROVIDER_RESPONSE_INVALID', accepted: true },
    )

    expect(fetcher).toHaveBeenCalledTimes(1)
  })
})

describe('DashScope Qwen Audio Flash adapter response metering bounds', () => {
  beforeEach(() => {
    credentialMocks.getProviderCredential.mockReset()
    credentialMocks.getProviderCredential.mockResolvedValue({ apiKey: testApiKey })
  })

  it('rejects a 200 response whose metered duration exceeds the synchronous ceiling without replaying the request', async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      new Response(
        JSON.stringify({
          output: { text: 'ok' },
          usage: { duration: QWEN_AUDIO_ASR_MAX_DURATION_SECONDS + 1 },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    )

    await expectDashScopeError(
      () =>
        createDashScopeQwenAudioAsrAdapter({ fetch: fetcher }).transcribe(
          createEvent(),
          dashScopeProvider(),
          Buffer.from('synthetic-pcm-audio-bytes'),
          { durationSeconds: 1 },
        ),
      { code: 'ASR_PROVIDER_RESPONSE_INVALID', accepted: true },
    )

    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('bills a metered duration exactly at the synchronous ceiling', async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      new Response(
        JSON.stringify({
          output: { text: '  ceiling  ' },
          usage: { duration: QWEN_AUDIO_ASR_MAX_DURATION_SECONDS },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    )

    await expect(
      createDashScopeQwenAudioAsrAdapter({ fetch: fetcher }).transcribe(
        createEvent(),
        dashScopeProvider(),
        Buffer.from('synthetic-pcm-audio-bytes'),
        { durationSeconds: 1 },
      ),
    ).resolves.toEqual({ transcript: 'ceiling', billedSeconds: QWEN_AUDIO_ASR_MAX_DURATION_SECONDS })
  })
})

describe('DashScope Qwen Audio Flash synchronous adapter', () => {
  beforeEach(() => {
    credentialMocks.getProviderCredential.mockReset()
    credentialMocks.getProviderCredential.mockResolvedValue({ apiKey: testApiKey })
  })

  it('posts the exact generation request with the Qwen model, SSE disabled, and a Base64 WAV input', async () => {
    const audio = pcmWav(1_600)
    const requests: QwenRequest[] = []
    const fetcher = qwenFetch(requests, {
      output: { text: ' 会议纪要 ' },
      usage: { duration: 2.5 },
      request_id: 'req-abc',
    })

    const result = await createDashScopeQwenAudioAsrAdapter({ fetch: fetcher }).transcribe(
      createEvent(),
      dashScopeProvider(),
      audio,
      { durationSeconds: 3 },
    )

    expect(result).toEqual({ transcript: '会议纪要', billedSeconds: 2.5, requestId: 'req-abc' })
    expect(JSON.stringify(result)).not.toContain(testApiKey)
    expect(requests).toHaveLength(1)
    const [request] = requests
    expect(request).toMatchObject({
      method: 'POST',
      url: 'https://dashscope.example.com/api/v1/services/aigc/multimodal-generation/generation',
    })
    expect(request!.headers.get('x-dashscope-sse')).toBe('disable')
    expect(request!.headers.get('content-type')).toBe('application/json')
    expect(request!.headers.get('authorization')).toBe(`Bearer ${testApiKey}`)
    expect(JSON.parse(request!.body)).toEqual({
      model: QWEN_AUDIO_ASR_MODEL,
      input: {
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'input_audio',
                input_audio: { data: `data:audio/wav;base64,${audio.toString('base64')}` },
              },
            ],
          },
        ],
      },
      parameters: { format: 'wav', sample_rate: 16_000 },
    })
  })

  it.each([
    { name: 'normalizes a regional tag to its primary language', language: 'zh-CN', hints: ['zh'] },
    { name: 'lowercases a tag regardless of its separator', language: 'EN_us', hints: ['en'] },
    { name: 'drops a value that is not a language code', language: 'dragon', hints: undefined },
    { name: 'omits hints when no language is configured', language: undefined, hints: undefined },
  ])('$name', async ({ language, hints }) => {
    const requests: QwenRequest[] = []
    const fetcher = qwenFetch(requests, { output: { text: 'ok' }, usage: { duration: 1 } })

    await createDashScopeQwenAudioAsrAdapter({ fetch: fetcher }).transcribe(
      createEvent(),
      dashScopeProvider(),
      pcmWav(1_600),
      { durationSeconds: 1, language },
    )

    expect(JSON.parse(requests[0]!.body).parameters).toEqual({
      format: 'wav',
      sample_rate: 16_000,
      ...(hints ? { language_hints: hints } : {}),
    })
  })

  it.each([
    { name: 'a top-level output text', payload: { output: { text: '  top level  ' } }, transcript: 'top level' },
    {
      name: 'a nested sentence text',
      payload: { output: { output: { sentence: { text: 'sentence' } } } },
      transcript: 'sentence',
    },
    { name: 'a nested output text', payload: { output: { output: { text: 'nested' } } }, transcript: 'nested' },
    {
      name: 'a canonical transcription under a direct output sentence',
      payload: { output: { sentence: { text: 'direct sentence' } } },
      transcript: 'direct sentence',
    },
  ])('normalizes $name', async ({ payload, transcript }) => {
    const fetcher = qwenFetch([], { ...payload, usage: { duration: 1.5 } })

    const result = await createDashScopeQwenAudioAsrAdapter({ fetch: fetcher }).transcribe(
      createEvent(),
      dashScopeProvider(),
      pcmWav(1_600),
      { durationSeconds: 9 },
    )

    expect(result).toEqual({ transcript, billedSeconds: 1.5 })
  })

  it('falls back to the server-parsed duration when the provider omits usage', async () => {
    const fetcher = qwenFetch([], { output: { text: 'ok' } })

    const result = await createDashScopeQwenAudioAsrAdapter({ fetch: fetcher }).transcribe(
      createEvent(),
      dashScopeProvider(),
      pcmWav(1_600),
      { durationSeconds: 4.25 },
    )

    expect(result).toEqual({ transcript: 'ok', billedSeconds: 4.25 })
  })

  it('discards a provider request id that is not a safe identifier', async () => {
    const fetcher = qwenFetch([], { output: { text: 'ok' }, usage: { duration: 1 }, request_id: 'not a valid id' })

    const result = await createDashScopeQwenAudioAsrAdapter({ fetch: fetcher }).transcribe(
      createEvent(),
      dashScopeProvider(),
      pcmWav(1_600),
      { durationSeconds: 1 },
    )

    expect(result).toEqual({ transcript: 'ok', billedSeconds: 1 })
  })

  it('maps a provider rejection to a stable pre-acceptance error', async () => {
    const fetcher: typeof fetch = async () => new Response(JSON.stringify({ code: 'InvalidApiKey' }), { status: 401 })

    await expectDashScopeError(
      () =>
        createDashScopeQwenAudioAsrAdapter({ fetch: fetcher }).transcribe(
          createEvent(),
          dashScopeProvider(),
          pcmWav(1_600),
          { durationSeconds: 1 },
        ),
      { code: 'ASR_PROVIDER_REJECTED', accepted: false },
    )
  })

  it.each([
    // A timeout or a server-side failure leaves the provider's outcome unknown: it may have
    // accepted and charged the request, so the caller must treat it as accepted-uncertain and
    // never refund or replay.
    { status: 408, accepted: true, code: 'ASR_PROVIDER_UNAVAILABLE' },
    { status: 500, accepted: true, code: 'ASR_PROVIDER_UNAVAILABLE' },
    { status: 503, accepted: true, code: 'ASR_PROVIDER_UNAVAILABLE' },
    // Definitive client errors are pre-acceptance: nothing was charged, so the hold is refunded.
    { status: 429, accepted: false, code: 'ASR_PROVIDER_REJECTED' },
    { status: 400, accepted: false, code: 'ASR_PROVIDER_REJECTED' },
    { status: 401, accepted: false, code: 'ASR_PROVIDER_REJECTED' },
  ])('maps HTTP $status to accepted=$accepted', async ({ status, accepted, code }) => {
    const fetcher: typeof fetch = async () => new Response(JSON.stringify({ code: 'ProviderError' }), { status })

    await expectDashScopeError(
      () =>
        createDashScopeQwenAudioAsrAdapter({ fetch: fetcher }).transcribe(
          createEvent(),
          dashScopeProvider(),
          pcmWav(1_600),
          { durationSeconds: 1 },
        ),
      { code, accepted },
    )
  })

  it('maps a transport failure to an accepted uncertain error that must not be replayed', async () => {
    const fetcher: typeof fetch = async () => {
      throw new TypeError('socket hang up')
    }

    await expectDashScopeError(
      () =>
        createDashScopeQwenAudioAsrAdapter({ fetch: fetcher }).transcribe(
          createEvent(),
          dashScopeProvider(),
          pcmWav(1_600),
          { durationSeconds: 1 },
        ),
      { code: 'ASR_PROVIDER_UNAVAILABLE', accepted: true },
    )
  })

  it('maps a 200 response without any transcript to an accepted invalid-response error', async () => {
    const fetcher: typeof fetch = async () => new Response(JSON.stringify({ output: {} }), { status: 200 })

    await expectDashScopeError(
      () =>
        createDashScopeQwenAudioAsrAdapter({ fetch: fetcher }).transcribe(
          createEvent(),
          dashScopeProvider(),
          pcmWav(1_600),
          { durationSeconds: 1 },
        ),
      { code: 'ASR_PROVIDER_RESPONSE_INVALID', accepted: true },
    )
  })

  it.each([
    {
      name: 'an audio clip whose Data URI exceeds the cap',
      audio: () => pcmWav(200),
      options: { durationSeconds: 1 },
      adapterOptions: { maxDataUriBytes: 128 },
      code: 'ASR_AUDIO_TOO_LARGE',
    },
    {
      name: 'an empty audio buffer',
      audio: () => Buffer.alloc(0),
      options: { durationSeconds: 1 },
      adapterOptions: {},
      code: 'ASR_PROVIDER_CONFIGURATION_INVALID',
    },
    {
      name: 'a non-positive duration',
      audio: () => pcmWav(1_600),
      options: { durationSeconds: 0 },
      adapterOptions: {},
      code: 'ASR_PROVIDER_CONFIGURATION_INVALID',
    },
    {
      name: 'a duration past the synchronous cap',
      audio: () => pcmWav(1_600),
      options: { durationSeconds: QWEN_AUDIO_ASR_MAX_DURATION_SECONDS + 0.1 },
      adapterOptions: {},
      code: 'ASR_PROVIDER_CONFIGURATION_INVALID',
    },
    {
      name: 'a model override that is not the synchronous model',
      audio: () => pcmWav(1_600),
      options: { durationSeconds: 1, model: 'qwen-audio-3.0-asr-flash-filetrans' },
      adapterOptions: {},
      code: 'ASR_PROVIDER_CONFIGURATION_INVALID',
    },
  ] as const)('refuses $name before any provider request', async ({ audio, options, adapterOptions, code }) => {
    const fetcher = vi.fn<typeof fetch>()

    await expectDashScopeError(
      () =>
        createDashScopeQwenAudioAsrAdapter({ fetch: fetcher, ...adapterOptions }).transcribe(
          createEvent(),
          dashScopeProvider(),
          audio(),
          options,
        ),
      { code, accepted: false },
    )

    expect(fetcher).not.toHaveBeenCalled()
  })
})
