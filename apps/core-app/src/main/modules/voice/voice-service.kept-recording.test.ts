import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const keptMocks = vi.hoisted(() => ({
  keep: vi.fn(),
  read: vi.fn()
}))

vi.mock('@talex-touch/tuff-native/audio', () => ({
  getNativeAudioSupport: vi.fn(),
  startCapture: vi.fn(),
  pollCapture: vi.fn(),
  snapshotCapture: vi.fn(),
  stopCapture: vi.fn(),
  cancelCapture: vi.fn(),
  playAudio: vi.fn(),
  drainCapture: vi.fn(),
  typeText: vi.fn(),
  isAccessibilityTrusted: vi.fn()
}))

vi.mock('./voice-provider-runtime', () => ({
  getConfiguredAsrProvider: vi.fn(),
  getVoiceRecognitionLocation: vi.fn(() => 'cloud')
}))

vi.mock('../storage', () => ({ getMainConfig: vi.fn(() => ({ voiceInput: {} })) }))
vi.mock('../clipboard', () => ({ clipboardModule: { applyVoiceText: vi.fn() } }))
vi.mock('../system/active-app', () => ({ activeAppService: { getActiveApp: vi.fn() } }))
vi.mock('../ai/intelligence-sdk', () => ({
  tuffIntelligence: { audio: { stt: vi.fn() }, invoke: vi.fn() }
}))
vi.mock('../ai/intelligence-tts-service', () => ({
  intelligenceTtsService: { speak: vi.fn() }
}))
vi.mock('./voice-insights-store', () => ({
  voiceInsightsStore: { recordSuccess: vi.fn(async () => undefined), recordPolishPass: vi.fn() }
}))
vi.mock('./voice-recognition-store', () => ({
  voiceRecognitionStore: { record: vi.fn(async () => undefined) }
}))
vi.mock('./voice-kept-recordings', () => ({
  voiceKeptRecordings: { keep: keptMocks.keep, read: keptMocks.read }
}))

import * as nativeAudio from '@talex-touch/tuff-native/audio'
import type { VoiceProviderEvent } from '@talex-touch/tuff-voice'
import type { VoiceAsrStreamEvent } from '@talex-touch/utils/transport/sdk/domains/voice'
import { getConfiguredAsrProvider } from './voice-provider-runtime'
import { VoiceService } from './voice-service'

const support = nativeAudio.getNativeAudioSupport as unknown as ReturnType<typeof vi.fn>
const startCapture = nativeAudio.startCapture as unknown as ReturnType<typeof vi.fn>
const pollCapture = nativeAudio.pollCapture as unknown as ReturnType<typeof vi.fn>
const stopCapture = nativeAudio.stopCapture as unknown as ReturnType<typeof vi.fn>
const drainCapture = (nativeAudio as unknown as { drainCapture: ReturnType<typeof vi.fn> })
  .drainCapture
const resolveAsrProvider = getConfiguredAsrProvider as unknown as ReturnType<typeof vi.fn>

const KEPT = {
  id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
  url: 'tfile:///clip.wav',
  durationMs: 10
}

/** 16-bit LE mono PCM at a constant amplitude. */
function pcm(amplitude: number, samples = 160): Buffer {
  const buffer = Buffer.alloc(samples * 2)
  for (let index = 0; index < samples; index += 1) buffer.writeInt16LE(amplitude, index * 2)
  return buffer
}

/** A provider connection whose events the test pushes; `end()` flushes the final and closes. */
function createFakeConnection(finalText = 'hello world', emitFinal = true) {
  const pending: VoiceProviderEvent[] = []
  let wake: (() => void) | null = null
  let closed = false
  const push = (event: VoiceProviderEvent): void => {
    pending.push(event)
    wake?.()
    wake = null
  }
  const close = (): void => {
    closed = true
    wake?.()
    wake = null
  }
  const events = (async function* () {
    for (;;) {
      if (pending.length > 0) {
        yield pending.shift()!
        continue
      }
      if (closed) return
      await new Promise<void>((resolve) => {
        wake = resolve
      })
    }
  })()
  let failure: Error | null = null
  const connection = {
    events,
    writePcm: vi.fn(async (_chunk: Buffer) => {
      if (failure) throw failure
    }),
    end: vi.fn(async () => {
      if (emitFinal) push({ type: 'final', text: finalText, language: 'en' })
      close()
    }),
    abort: vi.fn(async () => close())
  }
  return {
    connection,
    push,
    fail: (error: Error) => {
      failure = error
    }
  }
}

/** Every event up to the end, and the failure the stream ended on, if any. */
async function run(
  gen: AsyncGenerator<VoiceAsrStreamEvent>
): Promise<{ events: VoiceAsrStreamEvent[]; error: unknown }> {
  const events: VoiceAsrStreamEvent[] = []
  let error: unknown
  const draining = (async () => {
    try {
      for await (const event of gen) events.push(event)
    } catch (caught) {
      error = caught
    }
  })()
  await vi.runAllTimersAsync()
  await draining
  return { events, error }
}

describe('VoiceService kept recordings (the composer voice clip)', () => {
  let fake: ReturnType<typeof createFakeConnection>

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    support.mockReturnValue({ supported: true, platform: 'darwin' })
    startCapture.mockResolvedValue({ sessionId: 's1' })
    stopCapture.mockReturnValue({
      audio: Buffer.alloc(200),
      format: 'wav',
      sampleRate: 16000,
      channels: 1,
      durationMs: 2000,
      stoppedReason: 'silence'
    })
    drainCapture.mockReturnValue({ pcm: pcm(8_000), sampleRate: 16000, channels: 1 })
    pollCapture.mockReturnValue({ active: false, durationMs: 100, stoppedReason: 'silence' })
    keptMocks.keep.mockResolvedValue(KEPT)
    fake = createFakeConnection()
    resolveAsrProvider.mockReturnValue({
      model: 'fake-model',
      provider: {
        id: 'fake',
        defaultStreamModel: 'fake-model',
        createStream: vi.fn(async () => fake.connection)
      }
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('announces the kept clip after the transcript and before end', async () => {
    const { events, error } = await run(
      new VoiceService().streamDictation({ keepRecording: true, deliveryTiming: 'live' })
    )

    expect(error).toBeUndefined()
    const types = events.map((event) => event.type)
    expect(types.indexOf('recording')).toBeGreaterThan(types.indexOf('final'))
    expect(types.at(-1)).toBe('end')
    expect(events).toContainEqual({ type: 'recording', recording: KEPT })
    // The session's own audio, as 16 kHz PCM.
    const [audio, sampleRate] = keptMocks.keep.mock.calls[0] as [Buffer, number]
    expect(audio.byteLength).toBeGreaterThan(0)
    expect(sampleRate).toBe(16_000)
  })

  it('keeps a clip for a session that heard no speech', async () => {
    fake = createFakeConnection('')

    const { events } = await run(new VoiceService().streamDictation({ keepRecording: true }))

    expect(events.slice(-3)).toEqual([
      { type: 'final', text: '' },
      { type: 'recording', recording: KEPT },
      { type: 'end' }
    ])
  })

  it('keeps nothing when the caller did not ask', async () => {
    const { events } = await run(new VoiceService().streamDictation({}))

    expect(events.some((event) => event.type === 'recording')).toBe(false)
    expect(keptMocks.keep).not.toHaveBeenCalled()
  })

  it('sends the clip ahead of a failure, so the renderer still learns its id', async () => {
    fake.connection.end.mockImplementationOnce(async () => {
      fake.push({
        type: 'error',
        code: 'NETWORK_FAILURE',
        message: 'socket closed',
        retryable: true
      })
    })

    const { events, error } = await run(new VoiceService().streamDictation({ keepRecording: true }))

    expect(events.at(-1)).toEqual({ type: 'recording', recording: KEPT })
    expect(error).toMatchObject({ message: 'NETWORK_FAILURE' })
  })

  it('keeps nothing after a cancel', async () => {
    pollCapture.mockReturnValue({ active: true, durationMs: 0, stoppedReason: null })
    const controller = new AbortController()
    const running = run(
      new VoiceService().streamDictation({ keepRecording: true }, controller.signal)
    )
    await vi.advanceTimersByTimeAsync(200)
    controller.abort()

    const { events, error } = await running

    expect(error).toBeDefined()
    expect(events.some((event) => event.type === 'recording')).toBe(false)
    expect(keptMocks.keep).not.toHaveBeenCalled()
  })

  it('finishes the session normally when the clip cannot be written', async () => {
    keptMocks.keep.mockRejectedValueOnce(new Error('TEMP_FILE_TOO_LARGE'))

    const { events, error } = await run(new VoiceService().streamDictation({ keepRecording: true }))

    expect(error).toBeUndefined()
    expect(events.some((event) => event.type === 'recording')).toBe(false)
    expect(events.at(-1)).toEqual({ type: 'end' })
  })
})

describe('VoiceService.transcribeRecording', () => {
  let createStream: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    createStream = vi.fn()
    resolveAsrProvider.mockReturnValue({
      model: 'now-model',
      mode: 'realtime',
      provider: { id: 'now', defaultStreamModel: 'now-model', createStream }
    })
  })

  it('replays the clip through the recogniser configured now, in 200ms slices', async () => {
    const fake = createFakeConnection('  再说一遍 ')
    createStream.mockResolvedValue(fake.connection)
    keptMocks.read.mockResolvedValue({ pcm: pcm(1_000, 8_000), sampleRate: 16_000 })

    const result = await new VoiceService().transcribeRecording({
      recordingId: KEPT.id,
      language: 'zh-CN'
    })

    expect(result).toEqual({ text: '再说一遍', language: 'en' })
    expect(createStream).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'now-model',
        language: 'zh-CN',
        audio: expect.objectContaining({ format: 'pcm', sampleRate: 16_000 })
      })
    )
    // 16 000 bytes of PCM in 6 400-byte slices.
    expect(fake.connection.writePcm.mock.calls.map(([chunk]) => chunk.byteLength)).toEqual([
      6_400, 6_400, 3_200
    ])
    expect(fake.connection.abort).toHaveBeenCalled()
  })

  it('says the clip is gone rather than recognizing nothing', async () => {
    keptMocks.read.mockResolvedValue(null)

    await expect(
      new VoiceService().transcribeRecording({ recordingId: KEPT.id })
    ).rejects.toMatchObject({ code: 'VOICE_RECORDING_NOT_FOUND', retryable: false })
    expect(createStream).not.toHaveBeenCalled()
  })

  it('fails with the provider code when recognition fails again', async () => {
    const fake = createFakeConnection('', false)
    fake.connection.end.mockImplementationOnce(async () => {
      fake.push({ type: 'error', code: 'NETWORK_FAILURE', message: 'down', retryable: true })
    })
    createStream.mockResolvedValue(fake.connection)
    keptMocks.read.mockResolvedValue({ pcm: pcm(1_000), sampleRate: 16_000 })

    await expect(
      new VoiceService().transcribeRecording({ recordingId: KEPT.id })
    ).rejects.toMatchObject({ code: 'NETWORK_FAILURE' })
    expect(fake.connection.abort).toHaveBeenCalled()
  })
})
