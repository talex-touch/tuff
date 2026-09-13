import type {
  IntelligenceInvokeOptions,
  IntelligenceInvokeResult,
  IntelligenceSTTPayload,
  IntelligenceSTTResult
} from '@talex-touch/tuff-intelligence'
import {
  type VoiceProviderAdapter,
  type VoiceProviderEvent,
  type VoiceStreamRequest,
  VoiceProviderError
} from '@talex-touch/tuff-voice'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../ai/intelligence-sdk', () => ({
  tuffIntelligence: {
    audio: { stt: vi.fn() }
  }
}))

import { createBufferedSttVoiceProvider } from './buffered-stt-provider'

type SttInvokeOptions = IntelligenceInvokeOptions & { readonly signal?: AbortSignal }
type SttInvoker = (
  payload: IntelligenceSTTPayload,
  options?: SttInvokeOptions
) => Promise<IntelligenceInvokeResult<IntelligenceSTTResult>>

interface InvokeCall {
  payload: IntelligenceSTTPayload
  options?: SttInvokeOptions
}

const PROVIDER_ID = 'tuff-nexus-default'
const FROZEN_MODEL = 'nexus-audio-transcribe'
const MAX_BUFFER_BYTES = 7_500_000
const WAV_DATA_URI_PREFIX = 'data:audio/wav;base64,'

function invokeResult(
  result: IntelligenceSTTResult
): IntelligenceInvokeResult<IntelligenceSTTResult> {
  return {
    result,
    usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    model: FROZEN_MODEL,
    latency: 1,
    traceId: 'trace-buffered-stt',
    provider: PROVIDER_ID
  }
}

function recordingInvoker(respond: SttInvoker = async () => invokeResult({ text: 'ok' })) {
  const calls: InvokeCall[] = []
  const invoke: SttInvoker = (payload, options) => {
    calls.push({ payload, options })
    return respond(payload, options)
  }
  return { invoke, calls }
}

function request(overrides: Partial<VoiceStreamRequest> = {}): VoiceStreamRequest {
  return {
    // Deliberately different from the frozen provider/model so the frozen selection is the only
    // thing that can appear in the outbound invoke options.
    model: 'client-requested-model',
    requestId: 'req-buffered-1',
    audio: { format: 'pcm', sampleRate: 24_000, channels: 1, bitsPerSample: 16 },
    ...overrides
  }
}

function providerWith(invoke: SttInvoker): VoiceProviderAdapter {
  return createBufferedSttVoiceProvider({ providerId: PROVIDER_ID, model: FROZEN_MODEL, invoke })
}

async function collect(events: AsyncIterable<VoiceProviderEvent>): Promise<VoiceProviderEvent[]> {
  const out: VoiceProviderEvent[] = []
  for await (const event of events) out.push(event)
  return out
}

/** Decodes the STT request payload back into bytes, failing loudly if it is not a WAV data URI. */
function decodeWavDataUri(audio: unknown): Buffer {
  if (typeof audio !== 'string' || !audio.startsWith(WAV_DATA_URI_PREFIX))
    throw new Error(`Expected a WAV data URI, received ${typeof audio}`)
  return Buffer.from(audio.slice(WAV_DATA_URI_PREFIX.length), 'base64')
}

async function expectProviderError(promise: Promise<unknown>, code: string): Promise<void> {
  const failure = await promise.then(
    () => null,
    (error: unknown) => error
  )
  expect(failure).toBeInstanceOf(VoiceProviderError)
  expect((failure as VoiceProviderError).code).toBe(code)
}

describe('createBufferedSttVoiceProvider', () => {
  it('encodes the buffered PCM as a WAV data URI and emits final then end', async () => {
    const firstChunk = Buffer.from([0x01, 0x02, 0x03, 0x04])
    const secondChunk = Buffer.from([0x05, 0x06])
    const expectedPcm = Buffer.concat([firstChunk, secondChunk])
    const { invoke, calls } = recordingInvoker(async () =>
      invokeResult({
        text: '  开会纪要  ',
        language: 'zh',
        billing: { requestId: 'billing-buffered-1', creditsCharged: 0, billedSeconds: 1.5 }
      })
    )

    const stream = await providerWith(invoke).createStream(request({ language: 'zh' }))
    await stream.writePcm(firstChunk)
    await stream.writePcm(secondChunk)
    // The caller's scratch buffer is reused right after the write; buffered audio must be a
    // snapshot rather than an alias of it.
    secondChunk.fill(0)
    await stream.end()

    const events = await collect(stream.events)
    expect(events.map((event) => event.type)).toEqual(['final', 'end'])
    expect(events[0]).toMatchObject({
      type: 'final',
      requestId: 'req-buffered-1',
      text: '开会纪要',
      language: 'zh',
      usage: { durationMs: 1500 }
    })
    expect(events[1]).toEqual({ type: 'end', requestId: 'req-buffered-1' })

    expect(calls).toHaveLength(1)
    const { payload, options } = calls[0]
    expect(payload.format).toBe('wav')
    expect(payload.language).toBe('zh')
    expect(options?.preferredProviderId).toBe(PROVIDER_ID)
    expect(options?.modelPreference).toEqual([FROZEN_MODEL])

    const wav = decodeWavDataUri(payload.audio)
    expect(wav.subarray(0, 4).toString('ascii')).toBe('RIFF')
    expect(wav.subarray(8, 12).toString('ascii')).toBe('WAVE')
    expect(wav.subarray(12, 16).toString('ascii')).toBe('fmt ')
    expect(wav.readUInt16LE(20)).toBe(1)
    expect(wav.readUInt16LE(22)).toBe(1)
    expect(wav.readUInt32LE(24)).toBe(24_000)
    expect(wav.readUInt16LE(34)).toBe(16)
    expect(wav.subarray(36, 40).toString('ascii')).toBe('data')
    expect(wav.readUInt32LE(4)).toBe(36 + expectedPcm.byteLength)
    expect(wav.readUInt32LE(40)).toBe(expectedPcm.byteLength)
    expect(wav.subarray(44).equals(expectedPcm)).toBe(true)
  })

  it('emits only end for audio that never carried a byte, without invoking the provider', async () => {
    const { invoke, calls } = recordingInvoker()
    const stream = await providerWith(invoke).createStream(request())

    await stream.writePcm(Buffer.alloc(0))
    await stream.end()

    expect(await collect(stream.events)).toEqual([{ type: 'end', requestId: 'req-buffered-1' }])
    expect(calls).toEqual([])
  })

  it('rejects the chunk that crosses the bounded buffer and never invokes the provider', async () => {
    const { invoke, calls } = recordingInvoker()
    const stream = await providerWith(invoke).createStream(request())

    // Exactly at the limit is still a valid buffer; the byte past it is not.
    await expect(stream.writePcm(Buffer.alloc(MAX_BUFFER_BYTES))).resolves.toBeUndefined()
    await expectProviderError(stream.writePcm(Buffer.alloc(1)), 'VOICE_AUDIO_TOO_LARGE')

    expect(calls).toEqual([])
  })

  it.each([
    {
      name: 'a coded provider failure',
      failure: Object.assign(new Error('upstream said: sk-live-secret'), {
        code: 'STT_UPSTREAM_UNAVAILABLE'
      }),
      code: 'STT_UPSTREAM_UNAVAILABLE'
    },
    {
      name: 'an uncoded provider failure',
      failure: new Error('provider exploded reading /private/keys/voice'),
      code: 'VOICE_STT_FAILED'
    }
  ])(
    'surfaces $name as one stable error event with no successful payload',
    async ({ failure, code }) => {
      const { invoke } = recordingInvoker(async () => {
        throw failure
      })
      const stream = await providerWith(invoke).createStream(request())

      await stream.writePcm(Buffer.from([0x01, 0x02]))
      await stream.end()

      const events = await collect(stream.events)
      expect(events.map((event) => event.type)).toEqual(['error'])
      expect(events[0]).toMatchObject({
        type: 'error',
        code,
        message: 'Buffered speech recognition failed.',
        retryable: false,
        requestId: 'req-buffered-1'
      })
      expect(JSON.stringify(events)).not.toContain('sk-live-secret')
      expect(JSON.stringify(events)).not.toContain('/private/keys/voice')
    }
  )

  it('observes abort, suppresses the late provider result, and refuses further audio', async () => {
    let observedSignal: AbortSignal | undefined
    const pending = Promise.withResolvers<IntelligenceInvokeResult<IntelligenceSTTResult>>()
    const { invoke } = recordingInvoker((_payload, options) => {
      observedSignal = options?.signal
      return pending.promise
    })
    const stream = await providerWith(invoke).createStream(request())

    await stream.writePcm(Buffer.from([0x01, 0x02]))
    const ending = stream.end()
    await stream.abort()

    expect(observedSignal?.aborted).toBe(true)
    pending.resolve(invokeResult({ text: 'late transcript that must not be delivered' }))
    await ending

    expect(await collect(stream.events)).toEqual([])
    await expectProviderError(stream.writePcm(Buffer.from([0x03])), 'VOICE_STREAM_ABORTED')
  })

  it('declares upload unsupported and refuses upload transcription', async () => {
    const adapter = providerWith(recordingInvoker().invoke)

    expect(adapter.capabilities.upload).toBe(false)
    await expectProviderError(
      adapter.transcribeUpload({
        model: FROZEN_MODEL,
        requestId: 'req-buffered-1',
        source: { kind: 'bytes', bytes: Buffer.from([0x01]), format: 'wav' }
      }),
      'VOICE_UPLOAD_UNSUPPORTED'
    )
  })
})
