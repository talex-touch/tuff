import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const voiceInsightsMocks = vi.hoisted(() => ({
  recordSuccess: vi.fn(async () => undefined),
  recordPolishPass: vi.fn(async () => undefined)
}))

const polishPromptMocks = vi.hoisted(() => ({
  getVoicePolishPrompt: vi.fn((strength: string) => strength)
}))

const storageMocks = vi.hoisted(() => ({ getMainConfig: vi.fn() }))

const recognitionStoreMocks = vi.hoisted(() => ({
  record: vi.fn<(input: VoiceRecognitionRecordInput) => Promise<void>>(async () => undefined)
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

vi.mock('./polish-prompt', () => ({
  getVoicePolishPrompt: polishPromptMocks.getVoicePolishPrompt,
  wrapTranscription: (transcript: string) => JSON.stringify({ transcription: transcript })
}))

vi.mock('../storage', () => ({ getMainConfig: storageMocks.getMainConfig }))

vi.mock('../clipboard', () => ({
  clipboardModule: { applyVoiceText: vi.fn() }
}))

vi.mock('../system/active-app', () => ({
  activeAppService: { getActiveApp: vi.fn() }
}))

vi.mock('../ai/intelligence-sdk', () => ({
  tuffIntelligence: {
    audio: { stt: vi.fn() },
    invoke: vi.fn()
  }
}))

vi.mock('../ai/intelligence-tts-service', () => ({
  intelligenceTtsService: { speak: vi.fn() }
}))
vi.mock('./voice-insights-store', () => ({
  voiceInsightsStore: {
    recordSuccess: voiceInsightsMocks.recordSuccess,
    recordPolishPass: voiceInsightsMocks.recordPolishPass
  }
}))

vi.mock('./voice-recognition-store', () => ({
  voiceRecognitionStore: { record: recognitionStoreMocks.record }
}))

import * as nativeAudio from '@talex-touch/tuff-native/audio'
import type { VoiceProviderEvent } from '@talex-touch/tuff-voice'
import type {
  VoiceAsrStreamEvent,
  VoiceAsrStreamPayload
} from '@talex-touch/utils/transport/sdk/domains/voice'
import { clipboardModule } from '../clipboard'
import { activeAppService } from '../system/active-app'
import { tuffIntelligence } from '../ai/intelligence-sdk'
import { getConfiguredAsrProvider } from './voice-provider-runtime'
import type { VoiceRecognitionRecordInput } from './voice-recognition-store'
import { VoiceService } from './voice-service'

const support = nativeAudio.getNativeAudioSupport as unknown as ReturnType<typeof vi.fn>
const startCapture = nativeAudio.startCapture as unknown as ReturnType<typeof vi.fn>
const pollCapture = nativeAudio.pollCapture as unknown as ReturnType<typeof vi.fn>
const stopCapture = nativeAudio.stopCapture as unknown as ReturnType<typeof vi.fn>
const drainCapture = (nativeAudio as unknown as { drainCapture: ReturnType<typeof vi.fn> })
  .drainCapture
const typeText = (nativeAudio as unknown as { typeText: ReturnType<typeof vi.fn> }).typeText
const isAccessibilityTrusted = (
  nativeAudio as unknown as { isAccessibilityTrusted: ReturnType<typeof vi.fn> }
).isAccessibilityTrusted
const getActiveApp = activeAppService.getActiveApp as unknown as ReturnType<typeof vi.fn>
const applyVoiceText = clipboardModule.applyVoiceText as unknown as ReturnType<typeof vi.fn>
const invoke = tuffIntelligence.invoke as unknown as ReturnType<typeof vi.fn>
const stt = tuffIntelligence.audio.stt as unknown as ReturnType<typeof vi.fn>
const resolveAsrProvider = getConfiguredAsrProvider as unknown as ReturnType<typeof vi.fn>
const getVoicePolishPrompt = polishPromptMocks.getVoicePolishPrompt
const getMainConfig = storageMocks.getMainConfig

async function drainStream(
  gen: AsyncGenerator<VoiceAsrStreamEvent>
): Promise<VoiceAsrStreamEvent[]> {
  const events: VoiceAsrStreamEvent[] = []
  const draining = (async () => {
    for await (const event of gen) events.push(event)
  })()
  await vi.runAllTimersAsync()
  await draining
  return events
}

/**
 * Runs a generator to completion in the background.
 *
 * Overlapping sessions are the point of several recovery tests, so both streams have to be
 * alive at once; `drainStream` would await the first one instead. Failures are swallowed here
 * because the session under test is expected to fail or be cancelled; the assertions read the
 * externally observable buffer state, not the generator's rejections.
 */
function pumpInBackground(gen: AsyncGenerator<VoiceAsrStreamEvent>): { done: Promise<void> } {
  const done = (async () => {
    try {
      for await (const _event of gen) {
        // drain; the session state is what the tests assert
      }
    } catch {
      // the failure or cancellation under test
    }
  })()
  return { done }
}

/** 16-bit LE mono PCM at a constant amplitude, so the expected RMS is exact. */
function pcm(amplitude: number, samples = 160): Buffer {
  const buffer = Buffer.alloc(samples * 2)
  for (let index = 0; index < samples; index += 1) {
    buffer.writeInt16LE(amplitude, index * 2)
  }
  return buffer
}

/**
 * Above the 12-unit polish gate. A shorter transcript is now delivered raw with no provider
 * call, so every test below that asserts a polished delivery — or that cleanup alone explains a
 * missing call — has to use a sentence the gate will actually send.
 */
const POLISHABLE_TRANSCRIPT =
  'please tidy up this long dictated sentence and deliver it to the active app for me'
/** 70 units: past the 60-unit threshold, where the saved strength is used rather than natural. */
const FULL_TIER_TRANSCRIPT =
  '明天上午十点我们开一个短会，先把这周的进度过一遍，然后确定下周每个模块的具体负责人和交付时间，最后把会议纪要和行动项发到群里，大家记得提前看一下文档'

/**
 * A provider connection whose transcript events are pushed by the test.
 *
 * `end()` is what a real adapter does when the capture pump finishes: flush the final
 * transcript and close. That is precisely the path `stop` has to keep alive.
 */
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
    abort: vi.fn(async () => {
      close()
    })
  }

  /** Make the next PCM write blow up, which is how a provider drop reaches the generator. */
  const fail = (error: Error): void => {
    failure = error
  }

  return { connection, push, fail }
}

/**
 * The connection the fake provider returns, named as the tests build it.
 *
 * It intentionally omits `VoiceStreamConnection.ready`: the real contract gates writes behind a
 * handshake, while a fake connection is writable immediately. Importing the production type here
 * would describe something these fixtures never produce.
 */
interface FakeVoiceConnection {
  events: AsyncIterable<VoiceProviderEvent>
  writePcm: (chunk: Buffer) => Promise<void>
  end: () => Promise<void>
  abort: (reason?: string) => Promise<void>
}

describe('VoiceService.streamDictation via provider', () => {
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
    drainCapture.mockReturnValue({ pcm: pcm(16_384), sampleRate: 16000, channels: 1 })
    invoke.mockResolvedValue({ result: 'Hello world.' })
    getActiveApp.mockResolvedValue({
      identifier: 'com.example.editor',
      displayName: 'Editor',
      bundleId: 'com.example.editor',
      processId: 123,
      executablePath: null,
      platform: 'macos',
      windowTitle: null,
      lastUpdated: Date.now()
    })
    isAccessibilityTrusted.mockReturnValue(true)
    typeText.mockReturnValue({ ok: true })
    getMainConfig.mockReturnValue({ voiceInput: { polishStrength: 'deep' } })

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

  async function collect(gen: AsyncGenerator<VoiceAsrStreamEvent>): Promise<VoiceAsrStreamEvent[]> {
    const events: VoiceAsrStreamEvent[] = []
    const draining = (async () => {
      for await (const event of gen) events.push(event)
    })()
    await vi.runAllTimersAsync()
    await draining
    return events
  }

  // The two halves belong together: `stop` only means anything as the opposite of `cancel`,
  // and asserting either one alone lets it quietly become the other.
  it('finalizes and delivers on stop, but delivers nothing on cancel', async () => {
    // The stop half asserts a polished delivery, which the gate only allows above 12 units.
    fake = createFakeConnection(POLISHABLE_TRANSCRIPT)
    pollCapture.mockReturnValue({ active: true, durationMs: 0, stoppedReason: null })

    const stopController = new AbortController()
    const stopped = collect(
      new VoiceService().streamDictation({ delivery: 'active-app' }, undefined, {
        stopSignal: stopController.signal
      })
    )
    await Promise.resolve()
    stopController.abort()

    const events = await stopped
    expect(events.find((event) => event.type === 'final')).toMatchObject({
      type: 'final',
      text: 'Hello world.',
      delivery: { method: 'native' }
    })
    expect(events.at(-1)).toEqual({ type: 'end' })
    expect(typeText).toHaveBeenCalledWith('Hello world.')

    vi.clearAllMocks()
    isAccessibilityTrusted.mockReturnValue(true)
    typeText.mockReturnValue({ ok: true })
    drainCapture.mockReturnValue({ pcm: pcm(16_384), sampleRate: 16000, channels: 1 })
    pollCapture.mockReturnValue({ active: true, durationMs: 0, stoppedReason: null })
    fake = createFakeConnection()
    resolveAsrProvider.mockReturnValue({
      model: 'fake-model',
      provider: {
        id: 'fake',
        defaultStreamModel: 'fake-model',
        createStream: vi.fn(async () => fake.connection)
      }
    })

    const cancelController = new AbortController()
    const generator = new VoiceService().streamDictation(
      { delivery: 'active-app' },
      cancelController.signal
    )
    const pending = generator.next()
    const rejected = expect(pending).rejects.toThrow('VOICE_OPERATION_CANCELLED')
    await Promise.resolve()
    cancelController.abort()
    await vi.runAllTimersAsync()
    await rejected

    expect(typeText).not.toHaveBeenCalled()
  })

  // The threshold is the whole point, so both sides of it are pinned here. Asserting only
  // the long case would pass just as well if delivery had stopped typing altogether.
  it('types a short transcript but pastes a long one', async () => {
    const short = 'Hello world.'
    const long = 'A'.repeat(81)

    for (const [text, expectation] of [
      [short, 'native'],
      [long, 'autopaste']
    ] as const) {
      vi.clearAllMocks()
      isAccessibilityTrusted.mockReturnValue(true)
      typeText.mockReturnValue({ ok: true })
      applyVoiceText.mockResolvedValue({ success: true })
      invoke.mockResolvedValue({ result: text })
      getActiveApp.mockResolvedValue({
        name: 'Notes',
        bundleId: 'com.apple.Notes',
        processId: 123,
        executablePath: null,
        platform: 'macos',
        windowTitle: null,
        lastUpdated: Date.now()
      })
      drainCapture.mockReturnValue({ pcm: pcm(16_384), sampleRate: 16000, channels: 1 })
      pollCapture.mockReturnValue({ active: true, durationMs: 0, stoppedReason: null })
      fake = createFakeConnection(POLISHABLE_TRANSCRIPT)
      resolveAsrProvider.mockReturnValue({
        model: 'fake-model',
        provider: {
          id: 'fake',
          defaultStreamModel: 'fake-model',
          createStream: vi.fn(async () => fake.connection)
        }
      })

      const controller = new AbortController()
      const collected = collect(
        new VoiceService().streamDictation({ delivery: 'active-app' }, undefined, {
          stopSignal: controller.signal
        })
      )
      await Promise.resolve()
      controller.abort()
      const events = await collected

      expect(events.find((event) => event.type === 'final')).toMatchObject({
        delivery: { method: expectation }
      })

      if (expectation === 'native') {
        expect(typeText).toHaveBeenCalledWith(text)
        expect(applyVoiceText).not.toHaveBeenCalled()
      } else {
        // Typing a paragraph blocks the main process for one synthetic key event per
        // character; the paste path costs the same two events at any length.
        expect(typeText).not.toHaveBeenCalled()
        expect(applyVoiceText).toHaveBeenCalledWith(text)
      }
    }
  })

  it('delivers a punctuation-revised live final without duplicate native text or polish', async () => {
    vi.clearAllMocks()
    isAccessibilityTrusted.mockReturnValue(true)
    typeText.mockResolvedValue({ ok: true })
    applyVoiceText.mockResolvedValue({ success: true })
    getActiveApp.mockResolvedValue({
      name: 'Notes',
      bundleId: 'com.apple.Notes',
      processId: 123,
      executablePath: null,
      platform: 'macos',
      windowTitle: null,
      lastUpdated: Date.now()
    })
    drainCapture.mockReturnValue({ pcm: pcm(16_384), sampleRate: 16_000, channels: 1 })
    pollCapture.mockReturnValue({ active: true, durationMs: 0, stoppedReason: null })
    const partial = '明天去超市带上苹果、香蕉和菠萝'
    const finalText = '明天去超市，带上苹果、香蕉和菠萝，这三样都要'
    fake = createFakeConnection(finalText)
    resolveAsrProvider.mockReturnValue({
      model: 'fake-model',
      provider: {
        id: 'fake',
        defaultStreamModel: 'fake-model',
        createStream: vi.fn(async () => fake.connection)
      }
    })

    const controller = new AbortController()
    const collected = collect(
      new VoiceService().streamDictation(
        { delivery: 'active-app', deliveryTiming: 'live' },
        undefined,
        { stopSignal: controller.signal }
      )
    )
    await Promise.resolve()

    fake.push({ type: 'partial', text: partial })
    fake.push({ type: 'partial', text: partial })
    controller.abort()
    const events = await collected

    expect(events.find((event) => event.type === 'final')).toMatchObject({ text: finalText })
    expect(typeText.mock.calls.map((call) => call[0])).toEqual([partial, '，这三样都要'])
    expect(typeText.mock.calls.map((call) => call[0]).join('')).toBe(
      '明天去超市带上苹果、香蕉和菠萝，这三样都要'
    )
    expect(invoke).not.toHaveBeenCalled()
    expect(applyVoiceText).not.toHaveBeenCalled()
  })

  /** The default gesture still delivers once, at the end, and still gets polished. */
  it('delivers once at the end when the timing is final', async () => {
    vi.clearAllMocks()
    isAccessibilityTrusted.mockReturnValue(true)
    typeText.mockResolvedValue({ ok: true })
    invoke.mockResolvedValue({ result: 'One two three.' })
    getActiveApp.mockResolvedValue({
      name: 'Notes',
      bundleId: 'com.apple.Notes',
      processId: 123,
      executablePath: null,
      platform: 'macos',
      windowTitle: null,
      lastUpdated: Date.now()
    })
    drainCapture.mockReturnValue({ pcm: pcm(16_384), sampleRate: 16000, channels: 1 })
    pollCapture.mockReturnValue({ active: true, durationMs: 0, stoppedReason: null })
    fake = createFakeConnection(
      'one two three four five six seven eight nine ten eleven twelve thirteen fourteen'
    )
    resolveAsrProvider.mockReturnValue({
      model: 'fake-model',
      provider: {
        id: 'fake',
        defaultStreamModel: 'fake-model',
        createStream: vi.fn(async () => fake.connection)
      }
    })

    const controller = new AbortController()
    const collected = collect(
      new VoiceService().streamDictation({ delivery: 'active-app' }, undefined, {
        stopSignal: controller.signal
      })
    )
    await Promise.resolve()
    fake.push({ type: 'partial', text: 'one' })
    fake.push({ type: 'partial', text: 'one two' })
    controller.abort()
    await collected

    // Nothing was typed while the partials arrived; the polished sentence landed once.
    expect(typeText.mock.calls.map((call) => call[0])).toEqual(['One two three.'])
    expect(invoke).toHaveBeenCalled()
  })

  it('freezes the saved polish strength while capture is still opening', async () => {
    // 70 units, so the pass runs in the `full` band and uses the frozen strength rather than
    // the natural scope the gate imposes on shorter transcripts.
    fake = createFakeConnection(FULL_TIER_TRANSCRIPT)
    const captureOpening = Promise.withResolvers<{ sessionId: string }>()
    startCapture.mockReturnValueOnce(captureOpening.promise)
    pollCapture.mockReturnValue({ active: false, durationMs: 200, stoppedReason: 'silence' })
    getMainConfig.mockReturnValue({ voiceInput: { polishStrength: 'structured' } })
    const generator = new VoiceService().streamDictation({})
    const ready = generator.next()

    await Promise.resolve()
    expect(startCapture).toHaveBeenCalledOnce()
    getMainConfig.mockReturnValue({ voiceInput: { polishStrength: 'deep' } })
    captureOpening.resolve({ sessionId: 's1' })
    await ready
    await collect(generator)

    expect(getVoicePolishPrompt).toHaveBeenCalledOnce()
    expect(getVoicePolishPrompt).toHaveBeenCalledWith('structured')
  })

  it('emits normalized levels only when the caller opts in', async () => {
    pollCapture.mockReturnValueOnce({ active: true, durationMs: 100, stoppedReason: null })
    pollCapture.mockReturnValue({ active: false, durationMs: 200, stoppedReason: 'silence' })

    const withLevels = await collect(new VoiceService().streamDictation({ emitLevel: true }))
    const levels = withLevels.filter((event) => event.type === 'level')
    expect(levels.length).toBeGreaterThan(0)
    for (const level of levels) {
      expect(level).toMatchObject({ type: 'level' })
      const { rms } = level as { rms: number }
      expect(rms).toBeGreaterThan(0)
      expect(rms).toBeLessThanOrEqual(1)
      // 16384/32768 = 0.5 at a constant amplitude.
      expect(rms).toBeCloseTo(0.5, 5)
    }

    vi.clearAllMocks()
    drainCapture.mockReturnValue({ pcm: pcm(16_384), sampleRate: 16000, channels: 1 })
    pollCapture.mockReturnValueOnce({ active: true, durationMs: 100, stoppedReason: null })
    pollCapture.mockReturnValue({ active: false, durationMs: 200, stoppedReason: 'silence' })
    invoke.mockResolvedValue({ result: 'Hello world.' })
    fake = createFakeConnection()
    resolveAsrProvider.mockReturnValue({
      model: 'fake-model',
      provider: {
        id: 'fake',
        defaultStreamModel: 'fake-model',
        createStream: vi.fn(async () => fake.connection)
      }
    })

    // Negative control: the default sequence must be byte-for-byte what it was before
    // `level` existed, or every existing caller has to start filtering frames.
    const withoutLevels = await collect(new VoiceService().streamDictation())
    expect(withoutLevels.some((event) => event.type === 'level')).toBe(false)
  })

  it('drops stale levels without losing a single provider event', async () => {
    // Stay live long enough for the pump to outpace the transcript by a wide margin.
    pollCapture.mockReturnValue({ active: true, durationMs: 0, stoppedReason: null })

    const stopController = new AbortController()
    const draining = collect(
      new VoiceService().streamDictation({ emitLevel: true }, undefined, {
        stopSignal: stopController.signal
      })
    )

    for (let tick = 0; tick < 40; tick += 1) {
      await vi.advanceTimersByTimeAsync(100)
      if (tick % 10 === 0) fake.push({ type: 'partial', text: `partial-${tick}` })
    }
    stopController.abort()

    const events = await draining
    const partials = events.filter((event) => event.type === 'partial')
    expect(partials.map((event) => (event as { text: string }).text)).toEqual([
      'partial-0',
      'partial-10',
      'partial-20',
      'partial-30'
    ])
    expect(events.find((event) => event.type === 'final')).toBeDefined()
    expect(events.at(-1)).toEqual({ type: 'end' })
  })

  it('surfaces a provider iterator rejection that arrives after native capture stops', async () => {
    pollCapture.mockReturnValue({ active: false, durationMs: 100, stoppedReason: 'silence' })
    const releaseIterator = Promise.withResolvers<void>()
    const iteratorFailure = new Error('VOICE_PROVIDER_ITERATOR_FAILED')
    const connection = {
      events: (async function* () {
        await releaseIterator.promise
        throw iteratorFailure
      })(),
      writePcm: vi.fn(async () => undefined),
      end: vi.fn(async () => releaseIterator.resolve()),
      abort: vi.fn(async () => undefined)
    }
    resolveAsrProvider.mockReturnValue({
      model: 'fake-model',
      provider: {
        id: 'fake',
        defaultStreamModel: 'fake-model',
        createStream: vi.fn(async () => connection)
      }
    })

    const iteratorDraining = (async () => {
      for await (const _event of new VoiceService().streamDictation()) {
        // The public stream must reject instead of completing as if recognition succeeded.
      }
    })()
    const observedIteratorFailure = iteratorDraining.catch((error: unknown) => error)
    await vi.runAllTimersAsync()
    await expect(observedIteratorFailure).resolves.toMatchObject({
      message: 'VOICE_PROVIDER_ITERATOR_FAILED'
    })

    expect(stopCapture).toHaveBeenCalledTimes(1)
    expect(connection.end).toHaveBeenCalledTimes(1)
  })

  it('projects a provider error event as its stable stream failure code', async () => {
    pollCapture.mockReturnValue({ active: false, durationMs: 100, stoppedReason: 'silence' })
    fake = createFakeConnection('')
    fake.connection.end.mockImplementationOnce(async () => {
      fake.push({
        type: 'error',
        code: 'VOICE_PROVIDER_STREAM_FAILED',
        message: 'provider failed',
        retryable: false
      })
    })

    const errorDraining = (async () => {
      for await (const _event of new VoiceService().streamDictation()) {
        // The public stream must reject instead of completing as if recognition succeeded.
      }
    })()
    const observedProviderError = errorDraining.catch((error: unknown) => error)
    await vi.runAllTimersAsync()
    await expect(observedProviderError).resolves.toMatchObject({
      message: 'VOICE_PROVIDER_STREAM_FAILED'
    })
  })

  it('emits an empty final before end for clean no-speech completion without delivery or stats', async () => {
    pollCapture.mockReturnValue({ active: false, durationMs: 100, stoppedReason: 'silence' })
    fake = createFakeConnection('')

    const events = await collect(new VoiceService().streamDictation({ delivery: 'active-app' }))

    expect(events).toEqual([{ type: 'ready' }, { type: 'final', text: '' }, { type: 'end' }])
    expect(typeText).not.toHaveBeenCalled()
    expect(voiceInsightsMocks.recordSuccess).not.toHaveBeenCalled()
  })
  it('promotes the last non-empty partial when the provider closes without a final', async () => {
    pollCapture.mockReturnValue({ active: false, durationMs: 100, stoppedReason: 'silence' })
    fake = createFakeConnection('', false)
    fake.push({ type: 'partial', text: 'partial transcript', language: 'en' })

    const events = await collect(new VoiceService().streamDictation({ cleanup: false }))

    expect(events).toEqual([
      { type: 'ready' },
      { type: 'partial', text: 'partial transcript' },
      { type: 'final', text: 'partial transcript' },
      { type: 'end' }
    ])
    expect(invoke).not.toHaveBeenCalled()
  })

  it.each([
    { mode: 'buffered' as const, deadlineMs: 150_000 },
    { mode: 'realtime' as const, deadlineMs: 30_000 }
  ])('gives a $mode provider a $deadlineMs ms streaming deadline', async ({ mode, deadlineMs }) => {
    const createStream = vi.fn(async () => fake.connection)
    resolveAsrProvider.mockReturnValue({
      model: 'fake-model',
      mode,
      provider: { id: 'fake', defaultStreamModel: 'fake-model', createStream }
    })
    pollCapture.mockReturnValue({ active: false, durationMs: 100, stoppedReason: 'silence' })

    await collect(new VoiceService().streamDictation({}))

    // A recorded endpoint is one long call, not a stream of partials: it needs the wider
    // deadline, while realtime ASR keeps the tighter capability budget.
    expect(createStream).toHaveBeenCalledWith(expect.objectContaining({ timeoutMs: deadlineMs }))
  })
})

/**
 * The retention rules are the feature, not an implementation detail — each one is asserted
 * from the outside, through the only thing that can observe the buffer: whether a retry
 * finds audio or reports it expired.
 */
describe('VoiceService retry buffer retention', () => {
  let fake: ReturnType<typeof createFakeConnection>
  let provider: { createStream: ReturnType<typeof vi.fn> }
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
    drainCapture.mockReturnValue({ pcm: pcm(16_384), sampleRate: 16000, channels: 1 })
    invoke.mockResolvedValue({ result: 'Hello world.' })
    getActiveApp.mockResolvedValue({
      identifier: 'com.example.editor',
      displayName: 'Editor',
      bundleId: 'com.example.editor',
      processId: 123,
      executablePath: null,
      platform: 'macos',
      windowTitle: null,
      lastUpdated: Date.now()
    })
    isAccessibilityTrusted.mockReturnValue(true)
    typeText.mockReturnValue({ ok: true })
    getMainConfig.mockReturnValue({ voiceInput: { polishStrength: 'deep' } })
    fake = createFakeConnection()
    provider = {
      createStream: vi.fn(async () => fake.connection)
    }
    resolveAsrProvider.mockReturnValue({
      model: 'fake-model',
      provider: {
        id: 'fake',
        defaultStreamModel: 'fake-model',
        ...provider
      }
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  async function runUntilFailure(
    service: VoiceService,
    payload: VoiceAsrStreamPayload = { emitLevel: false }
  ): Promise<void> {
    pollCapture.mockReturnValue({ active: true, durationMs: 0, stoppedReason: null })
    const generator = service.streamDictation(payload)
    const drained = (async () => {
      try {
        for await (const _event of generator) {
          // drain
        }
      } catch {
        // the failure under test
      }
    })()
    await vi.advanceTimersByTimeAsync(300)
    fake.fail(new Error('provider socket closed'))
    // Bounded, not runAllTimers: the grace timer is armed by the very failure under test,
    // and draining every pending timer would fire it and report the buffer as expired.
    await vi.advanceTimersByTimeAsync(500)
    await drained
  }

  it('replays retained PCM through the frozen failed ASR adapter without falling back to STT', async () => {
    const service = new VoiceService()
    await runUntilFailure(service)
    const retry = createFakeConnection(POLISHABLE_TRANSCRIPT)
    provider.createStream.mockResolvedValueOnce(retry.connection)
    resolveAsrProvider.mockReturnValue({
      model: 'replacement-model',
      provider: {
        id: 'replacement',
        defaultStreamModel: 'replacement-model',
        createStream: vi.fn()
      }
    })

    const result = await service.retryLastFailure({ delivery: 'active-app' })

    expect(result.expired).toBeUndefined()
    expect(result.text).toBe('Hello world.')
    expect(typeText).toHaveBeenCalledWith('Hello world.')
    expect(retry.connection.writePcm).toHaveBeenCalled()
    expect(retry.connection.end).toHaveBeenCalledOnce()
    expect(provider.createStream).toHaveBeenLastCalledWith(
      expect.objectContaining({ model: 'fake-model' })
    )
    expect(stt).not.toHaveBeenCalled()
  })

  it('reuses the buffered submission identity and deadline on retry', async () => {
    const requests: Array<{ requestId: string; timeoutMs: number }> = []
    let nextConnection = fake.connection
    const createStream = vi.fn(async (request: { requestId: string; timeoutMs: number }) => {
      requests.push(request)
      const connection = nextConnection
      nextConnection = fake.connection
      return connection
    })
    resolveAsrProvider.mockReturnValue({
      model: 'fake-model',
      mode: 'buffered',
      provider: { id: 'fake', defaultStreamModel: 'fake-model', createStream }
    })

    const service = new VoiceService()
    await runUntilFailure(service)
    // The buffered route mints a real UUID because it doubles as the Nexus idempotency key.
    expect(requests[0]?.requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    )

    const retry = createFakeConnection('retry words')
    nextConnection = retry.connection
    await service.retryLastFailure()

    // Retrying replays the same submission; a fresh id would be billed as a second one.
    expect(requests).toHaveLength(2)
    expect(requests[1]?.requestId).toBe(requests[0]?.requestId)
    expect(requests[1]?.timeoutMs).toBe(requests[0]?.timeoutMs)
  })

  it('uses the failed session strength rather than a later caller mutation on retry', async () => {
    const payload: VoiceAsrStreamPayload = { emitLevel: false, polishStrength: 'structured' }
    const service = new VoiceService()
    await runUntilFailure(service, payload)
    payload.polishStrength = 'natural'
    // 70 units: the `full` band, where the stored strength is the one that gets used.
    const retry = createFakeConnection(FULL_TIER_TRANSCRIPT)
    provider.createStream.mockResolvedValueOnce(retry.connection)
    getVoicePolishPrompt.mockClear()

    await service.retryLastFailure()

    expect(getVoicePolishPrompt).toHaveBeenCalledOnce()
    expect(getVoicePolishPrompt).toHaveBeenCalledWith('structured')
  })

  it('does not add polishing when retrying a cleanup-disabled recording', async () => {
    const service = new VoiceService()
    await runUntilFailure(service, { emitLevel: false, cleanup: false, polishStrength: 'natural' })
    // Long enough for the gate to have allowed a pass: cleanup alone must explain the absence.
    const retry = createFakeConnection(POLISHABLE_TRANSCRIPT)
    provider.createStream.mockResolvedValueOnce(retry.connection)
    invoke.mockClear()

    await service.retryLastFailure()

    expect(invoke).not.toHaveBeenCalled()
  })

  it('performs no polish request when the retained transcript is below the gate', async () => {
    const service = new VoiceService()
    await runUntilFailure(service)
    const retry = createFakeConnection('buffered words')
    provider.createStream.mockResolvedValueOnce(retry.connection)
    invoke.mockClear()

    const result = await service.retryLastFailure({ delivery: 'active-app' })

    // The replay path is the third caller of the same choke point: the gate is a property of
    // the transcript, so a short recording is re-delivered raw rather than re-polished.
    expect(result.text).toBe('buffered words')
    expect(typeText).toHaveBeenCalledWith('buffered words')
    expect(invoke).not.toHaveBeenCalled()
  })

  it('reports expiry instead of pretending, once the grace window closes', async () => {
    const service = new VoiceService()
    await runUntilFailure(service)

    await vi.advanceTimersByTimeAsync(15_001)
    const result = await service.retryLastFailure()

    expect(result).toEqual({ text: '', expired: true })
  })

  /**
   * Reads the private buffer on purpose.
   *
   * `retryLastFailure` cannot see the difference between "cleared" and "still held but never
   * armed" — it only checks the expiry stamp — so asserting through it passes even when the
   * audio is still in memory. The retention rule is about the memory, so the memory is what
   * gets asserted. (Verified: deleting the clear-on-success line fails this and not the
   * public-surface version.)
   */
  function heldAudioBytes(service: VoiceService): number {
    const buffer = (service as unknown as { retryBuffer: { bytes: number } | null }).retryBuffer
    return buffer?.bytes ?? 0
  }

  it('holds no audio after a successful session', async () => {
    pollCapture.mockReturnValueOnce({ active: true, durationMs: 100, stoppedReason: null })
    pollCapture.mockReturnValue({ active: false, durationMs: 200, stoppedReason: 'silence' })
    const service = new VoiceService()
    await drainStream(service.streamDictation({}))

    expect(heldAudioBytes(service)).toBe(0)
    expect(await service.retryLastFailure()).toEqual({ text: '', expired: true })
  })

  /**
   * Cancel keeps the audio so undo can restore the same words. If it cleared, the undo button
   * could only ever mean "record again", which is a different act wearing the wrong name.
   */
  it('keeps the audio after a cancel so undo can replay it through the same ASR adapter', async () => {
    pollCapture.mockReturnValue({ active: true, durationMs: 0, stoppedReason: null })
    const service = new VoiceService()
    const controller = new AbortController()
    const generator = service.streamDictation({}, controller.signal)
    const drained = (async () => {
      try {
        for await (const _event of generator) {
          // drain
        }
      } catch {
        // the cancellation under test
      }
    })()

    // Let real audio accumulate first: cancelling on the first tick buffers nothing, and the
    // assertions below would then pass no matter what the cancel path does.
    await vi.advanceTimersByTimeAsync(400)
    expect(heldAudioBytes(service)).toBeGreaterThan(0)

    controller.abort()
    await vi.advanceTimersByTimeAsync(300)
    await drained

    expect(heldAudioBytes(service)).toBeGreaterThan(0)
    const retry = createFakeConnection(POLISHABLE_TRANSCRIPT)
    provider.createStream.mockResolvedValueOnce(retry.connection)
    const restored = await service.retryLastFailure()
    expect(restored.expired).toBeUndefined()
    expect(restored.text).toBe('Hello world.')
  })

  it('drops cancelled audio when its recovery window closes', async () => {
    pollCapture.mockReturnValue({ active: true, durationMs: 0, stoppedReason: null })
    const service = new VoiceService()
    const controller = new AbortController()
    const generator = service.streamDictation({}, controller.signal)
    const drained = (async () => {
      try {
        for await (const _event of generator) {
          // drain
        }
      } catch {
        // the cancellation under test
      }
    })()
    await vi.advanceTimersByTimeAsync(400)
    controller.abort()
    await vi.advanceTimersByTimeAsync(300)
    await drained

    await vi.advanceTimersByTimeAsync(30_001)
    expect(heldAudioBytes(service)).toBe(0)
    expect(await service.retryLastFailure()).toEqual({ text: '', expired: true })
  })

  it('drops the audio when the grace window closes, not just the ability to use it', async () => {
    const service = new VoiceService()
    await runUntilFailure(service)
    expect(heldAudioBytes(service)).toBeGreaterThan(0)

    await vi.advanceTimersByTimeAsync(30_001)
    expect(heldAudioBytes(service)).toBe(0)
  })

  it('drops the audio when the provider declares the failure not retryable', async () => {
    pollCapture.mockReturnValue({ active: true, durationMs: 0, stoppedReason: null })
    const service = new VoiceService()
    const generator = service.streamDictation({ emitLevel: false })
    const drained = (async () => {
      try {
        for await (const _event of generator) {
          // drain
        }
      } catch {
        // the permanent failure under test
      }
    })()

    // Let real audio accumulate first, so a no-op retention path cannot pass by having nothing
    // to hold in the first place.
    await vi.advanceTimersByTimeAsync(400)
    // An authority change is terminal: replaying the audio would upload it under a principal
    // that no longer owns it, so the buffer must not survive to arm a retry.
    fake.push({
      type: 'error',
      code: 'VOICE_ASR_AUTHORITY_CHANGED',
      message: 'Buffered speech recognition authority changed.',
      retryable: false
    })
    await vi.advanceTimersByTimeAsync(500)
    await drained

    expect(heldAudioBytes(service)).toBe(0)
    expect(service.getRecoveryStatus()).toEqual({ available: false })
    expect(await service.retryLastFailure()).toEqual({ text: '', expired: true })
  })

  it('holds no audio after dispose', async () => {
    const service = new VoiceService()
    await runUntilFailure(service)
    expect(heldAudioBytes(service)).toBeGreaterThan(0)

    service.dispose()
    expect(heldAudioBytes(service)).toBe(0)
  })

  /**
   * The cap is sized for a whole 300s recording (~9.6 MiB). Below that, a long dictation used
   * to lose undo and retry partway through without saying so — the worst version of this
   * feature, since the button was still on screen.
   */
  it('keeps the retry for a recording the length of the cap allows', async () => {
    // 1 MB per drain across the ~8 the pump makes here: past the old 4 MiB cap around the
    // fifth, still well inside the current one.
    drainCapture.mockReturnValue({ pcm: pcm(16_384, 500_000), sampleRate: 16000, channels: 1 })
    const service = new VoiceService()
    await runUntilFailure(service)
    const retry = createFakeConnection('long recording')
    provider.createStream.mockResolvedValueOnce(retry.connection)

    // The audio is still there to re-transcribe: not `{ text: '', expired: true }`, which is
    // what the old cap turned a long dictation into halfway through.
    const result = await service.retryLastFailure()
    expect(result.expired).toBeUndefined()
    expect(result.text).toBeTruthy()
  })

  it('degrades to no retry rather than buffering without bound', async () => {
    // 5.5 MiB per drain: two ticks clear the 10 MiB cap before the failure lands. The cap is
    // sized for a full 300s recording (~9.6 MiB), so overflow now means something went wrong
    // rather than someone spoke for a while.
    drainCapture.mockReturnValue({ pcm: pcm(16_384, 2_750_000), sampleRate: 16000, channels: 1 })
    const service = new VoiceService()
    await runUntilFailure(service)

    expect(await service.retryLastFailure()).toEqual({ text: '', expired: true })
  })

  /**
   * One recovery slot, owned by the session that claimed it last.
   *
   * A superseded capture keeps running: its pump is detached and its connection can fail long
   * after the mic moved on. Those late callbacks are fenced by capture id, so they cannot grow,
   * arm or clear the buffer the new session owns — and the new session must still replay only
   * its own audio.
   */
  it('fences a superseded session so its late audio and failure cannot reach the new session buffer', async () => {
    const service = new VoiceService()
    const stopA = new AbortController()
    const bController = new AbortController()

    startCapture
      .mockResolvedValueOnce({ sessionId: 'sA' })
      .mockResolvedValueOnce({ sessionId: 'sB' })
    let bDrained = false
    drainCapture.mockImplementation((id: string) => {
      if (id !== 'sA' && bDrained) return { pcm: Buffer.alloc(0), sampleRate: 16000, channels: 1 }
      if (id !== 'sA') bDrained = true
      return { pcm: id === 'sA' ? pcm(8, 100) : pcm(9, 300), sampleRate: 16000, channels: 1 }
    })
    pollCapture.mockReturnValue({ active: true, durationMs: 0, stoppedReason: null })

    const fakeB = createFakeConnection('b words')
    const connections = [fake.connection, fakeB.connection]
    provider.createStream.mockImplementation(async () => connections.shift()!)

    const a = pumpInBackground(
      service.streamDictation({ emitLevel: false }, undefined, { stopSignal: stopA.signal })
    )
    await vi.advanceTimersByTimeAsync(150)
    expect(heldAudioBytes(service)).toBe(pcm(8, 100).length)

    const b = pumpInBackground(service.streamDictation({ emitLevel: false }, bController.signal))
    await vi.advanceTimersByTimeAsync(150)
    const bBytes = pcm(9, 300).length
    expect(heldAudioBytes(service)).toBe(bBytes)

    // A's next tick appends and then fails on the wire; its catch arms the buffer. Both acts
    // belong to A, but the slot now belongs to B, so neither may touch B.
    fake.fail(new Error('provider socket closed'))
    await vi.advanceTimersByTimeAsync(300)
    await a.done

    expect(heldAudioBytes(service)).toBe(bBytes)
    expect(service.getRecoveryStatus()).toEqual({ available: false })

    // A's grace timer, had it been armed against B, would drop B's audio here.
    await vi.advanceTimersByTimeAsync(15_001)
    expect(heldAudioBytes(service)).toBe(bBytes)
    expect(service.getRecoveryStatus()).toEqual({ available: false })

    bController.abort()
    await vi.advanceTimersByTimeAsync(300)
    await b.done
    expect(service.getRecoveryStatus().kind).toBe('cancelled')

    const retry = createFakeConnection('b words')
    provider.createStream.mockResolvedValueOnce(retry.connection)
    expect((await service.retryLastFailure()).text).toBe('b words')
    const replayed = retry.connection.writePcm.mock.calls.reduce(
      (total, [chunk]) => total + chunk.length,
      0
    )
    expect(replayed).toBe(bBytes)
  })

  /**
   * The complement of the failure case: a superseded session that finishes *successfully* is the
   * one path allowed to drop audio immediately, and it must drop only its own. Wiring that clear
   * to the slot instead of the session lets a late success erase the recovery still on screen.
   */
  it('fences a superseded success so it cannot clear the new session buffer', async () => {
    const service = new VoiceService()
    const stopA = new AbortController()
    const bController = new AbortController()

    startCapture
      .mockResolvedValueOnce({ sessionId: 'sA' })
      .mockResolvedValueOnce({ sessionId: 'sB' })
    let bDrained = false
    drainCapture.mockImplementation((id: string) => {
      if (id !== 'sA' && bDrained) return { pcm: Buffer.alloc(0), sampleRate: 16000, channels: 1 }
      if (id !== 'sA') bDrained = true
      return { pcm: id === 'sA' ? pcm(8, 100) : pcm(9, 300), sampleRate: 16000, channels: 1 }
    })
    pollCapture.mockReturnValue({ active: true, durationMs: 0, stoppedReason: null })

    const fakeB = createFakeConnection('b words')
    const connections = [fake.connection, fakeB.connection]
    provider.createStream.mockImplementation(async () => connections.shift()!)

    const a = pumpInBackground(
      service.streamDictation({ emitLevel: false }, undefined, { stopSignal: stopA.signal })
    )
    await vi.advanceTimersByTimeAsync(150)
    const b = pumpInBackground(service.streamDictation({ emitLevel: false }, bController.signal))
    await vi.advanceTimersByTimeAsync(150)
    const bBytes = pcm(9, 300).length
    expect(heldAudioBytes(service)).toBe(bBytes)

    // A stops and finishes cleanly through the success path, whose `clearRetryBuffer` names A.
    stopA.abort()
    await vi.advanceTimersByTimeAsync(300)
    await a.done

    expect(heldAudioBytes(service)).toBe(bBytes)

    bController.abort()
    await vi.advanceTimersByTimeAsync(300)
    await b.done
    expect(service.getRecoveryStatus().kind).toBe('cancelled')

    const retry = createFakeConnection('b words')
    provider.createStream.mockResolvedValueOnce(retry.connection)
    expect((await service.retryLastFailure()).text).toBe('b words')
  })

  /**
   * Two callers can press recovery before the first replay finishes — the HUD button plus an
   * imperative caller, say. They must share one in-flight replay, or the same audio is uploaded
   * twice, delivered twice and recorded twice.
   */
  it('collapses overlapping recovery calls into one replay, one delivery, and one success record', async () => {
    const service = new VoiceService()
    await runUntilFailure(service)
    const retry = createFakeConnection(POLISHABLE_TRANSCRIPT)
    provider.createStream.mockClear()
    provider.createStream.mockResolvedValueOnce(retry.connection)

    const first = service.retryLastFailure({ delivery: 'active-app' })
    const second = service.retryLastFailure({ delivery: 'active-app' })
    const [firstResult, secondResult] = await Promise.all([first, second])

    expect(provider.createStream).toHaveBeenCalledOnce()
    expect(retry.connection.end).toHaveBeenCalledOnce()
    expect(typeText).toHaveBeenCalledTimes(1)
    expect(typeText).toHaveBeenCalledWith('Hello world.')
    expect(voiceInsightsMocks.recordSuccess).toHaveBeenCalledTimes(1)
    // The second caller observes the first replay's result, not a fresh one.
    expect(secondResult).toBe(firstResult)
  })

  /**
   * A retry the provider refuses as non-retryable is terminal: the audio cannot be replayed
   * against a principal, or over a transport, that just rejected it, and the thrown error must
   * keep the provider's code and retryable flag so the HUD can tell the two apart. A retryable
   * refusal leaves the same recording in place for another attempt.
   */
  it('clears the held audio when the retry is refused as non-retryable, and keeps it otherwise', async () => {
    const service = new VoiceService()
    await runUntilFailure(service)
    const held = heldAudioBytes(service)
    expect(held).toBeGreaterThan(0)

    const refused = createFakeConnection('ignored', false)
    refused.push({
      type: 'error',
      code: 'VOICE_ASR_AUTHORITY_CHANGED',
      message: 'authority changed',
      retryable: false
    })
    provider.createStream.mockResolvedValueOnce(refused.connection)

    await expect(service.retryLastFailure()).rejects.toMatchObject({
      code: 'VOICE_ASR_AUTHORITY_CHANGED',
      retryable: false
    })

    expect(heldAudioBytes(service)).toBe(0)
    expect(service.getRecoveryStatus()).toEqual({ available: false })
  })

  it('keeps the same held audio when the retry failure is retryable', async () => {
    const service = new VoiceService()
    await runUntilFailure(service)
    const held = heldAudioBytes(service)

    const dropped = createFakeConnection('ignored', false)
    dropped.push({
      type: 'error',
      code: 'VOICE_ASR_RETRY_TRANSPORT',
      message: 'socket closed',
      retryable: true
    })
    provider.createStream.mockResolvedValueOnce(dropped.connection)

    await expect(service.retryLastFailure()).rejects.toMatchObject({ retryable: true })

    expect(heldAudioBytes(service)).toBe(held)
    expect(service.getRecoveryStatus().available).toBe(true)
  })

  /**
   * A session's claim on the recovery slot is fenced by generation, not by arrival order.
   *
   * The provider handshake can settle long after the user started a second recording: session A
   * opened first but its connection arrives last. Without the fence, A's `beginRetryBuffer` runs
   * after B has already armed its own buffer, silently clearing B and installing an empty slot.
   */
  it('fences a superseded generation so a late-connecting session cannot claim the newer buffer', async () => {
    const service = new VoiceService()
    const stopA = new AbortController()
    const bController = new AbortController()

    startCapture
      .mockResolvedValueOnce({ sessionId: 'sA' })
      .mockResolvedValueOnce({ sessionId: 'sB' })
    let bDrained = false
    drainCapture.mockImplementation((id: string) => {
      if (id !== 'sA' && bDrained) return { pcm: Buffer.alloc(0), sampleRate: 16000, channels: 1 }
      if (id !== 'sA') bDrained = true
      return { pcm: id === 'sA' ? pcm(8, 100) : pcm(9, 300), sampleRate: 16000, channels: 1 }
    })
    pollCapture.mockReturnValue({ active: true, durationMs: 0, stoppedReason: null })

    const fakeA = createFakeConnection()
    const fakeB = createFakeConnection('b words')
    let releaseA!: (connection: FakeVoiceConnection) => void
    const aConnection = new Promise<FakeVoiceConnection>((resolve) => {
      releaseA = resolve
    })
    provider.createStream
      .mockImplementationOnce(() => aConnection)
      .mockImplementationOnce(async () => fakeB.connection)

    const a = pumpInBackground(
      service.streamDictation({ emitLevel: false }, undefined, { stopSignal: stopA.signal })
    )
    await vi.advanceTimersByTimeAsync(0)

    const b = pumpInBackground(service.streamDictation({ emitLevel: false }, bController.signal))
    await vi.advanceTimersByTimeAsync(150)
    bController.abort()
    await vi.advanceTimersByTimeAsync(300)
    await b.done
    const bBytes = pcm(9, 300).length
    expect(service.getRecoveryStatus().kind).toBe('cancelled')
    expect(heldAudioBytes(service)).toBe(bBytes)

    // A's connection finally arrives. Its generation is stale, so it must not clear or claim B.
    releaseA(fakeA.connection)
    await vi.advanceTimersByTimeAsync(300)

    expect(service.getRecoveryStatus().kind).toBe('cancelled')
    expect(heldAudioBytes(service)).toBe(bBytes)

    const retry = createFakeConnection('b words')
    provider.createStream.mockResolvedValueOnce(retry.connection)
    expect((await service.retryLastFailure()).text).toBe('b words')
    const replayed = retry.connection.writePcm.mock.calls.reduce(
      (total, [chunk]) => total + chunk.length,
      0
    )
    expect(replayed).toBe(bBytes)

    stopA.abort()
    await vi.advanceTimersByTimeAsync(300)
    await a.done
  })

  /**
   * An in-flight replay owns the slot, not the next caller.
   *
   * A second capture's recovery must never be handed the first capture's promise — that would
   * deliver the wrong audio under the wrong identity. Until the first replay settles (here, by
   * the cancellation a new session triggers), the caller is told explicitly to come back.
   */
  it('refuses a new recovery while another capture replay is in flight, then serves it once cancelled', async () => {
    const service = new VoiceService()
    await runUntilFailure(service)

    const fakeA = createFakeConnection('a retry')
    let releaseARetry!: (connection: FakeVoiceConnection) => void
    const aGate = new Promise<FakeVoiceConnection>((resolve) => {
      releaseARetry = resolve
    })
    provider.createStream.mockImplementationOnce(() => aGate)
    const aRetry = service.retryLastFailure({ delivery: 'active-app' })
    const aRetrySettled = aRetry.catch((error: unknown) => error)
    await vi.advanceTimersByTimeAsync(0)

    // B starts and is cancelled while A's replay is still parked on its connection.
    const fakeB = createFakeConnection('b words')
    provider.createStream.mockImplementationOnce(async () => fakeB.connection)
    const bController = new AbortController()
    const b = pumpInBackground(service.streamDictation({ emitLevel: false }, bController.signal))
    await vi.advanceTimersByTimeAsync(150)
    bController.abort()
    await vi.advanceTimersByTimeAsync(300)
    await b.done
    expect(service.getRecoveryStatus().kind).toBe('cancelled')

    // B has recoverable audio, but A's replay still owns the in-flight slot.
    await expect(service.retryLastFailure()).rejects.toMatchObject({
      code: 'VOICE_RECOVERY_IN_PROGRESS'
    })
    expect(typeText).not.toHaveBeenCalled()

    // Cancelling A settles it; only then may B's own audio be replayed.
    releaseARetry(fakeA.connection)
    await aRetrySettled

    const retryB = createFakeConnection('b words')
    provider.createStream.mockResolvedValueOnce(retryB.connection)
    expect((await service.retryLastFailure({ delivery: 'active-app' })).text).toBe('b words')
    expect(typeText).toHaveBeenCalledWith('b words')
  })

  it('purges the capture when the retry connection refuses as non-retryable', async () => {
    const service = new VoiceService()
    await runUntilFailure(service)
    expect(heldAudioBytes(service)).toBeGreaterThan(0)

    provider.createStream.mockRejectedValueOnce(
      Object.assign(new Error('VOICE_ASR_AUTHORITY_CHANGED'), {
        code: 'VOICE_ASR_AUTHORITY_CHANGED',
        retryable: false
      })
    )

    await expect(service.retryLastFailure()).rejects.toMatchObject({
      code: 'VOICE_ASR_AUTHORITY_CHANGED',
      retryable: false
    })
    expect(heldAudioBytes(service)).toBe(0)
    expect(service.getRecoveryStatus()).toEqual({ available: false })
  })

  it('retains the capture when the retry connection fails retryably', async () => {
    const service = new VoiceService()
    await runUntilFailure(service)
    const held = heldAudioBytes(service)

    provider.createStream.mockRejectedValueOnce(
      Object.assign(new Error('VOICE_ASR_RETRY_TRANSPORT'), {
        code: 'VOICE_ASR_RETRY_TRANSPORT',
        retryable: true
      })
    )

    await expect(service.retryLastFailure()).rejects.toMatchObject({
      code: 'VOICE_ASR_RETRY_TRANSPORT',
      retryable: true
    })
    expect(heldAudioBytes(service)).toBe(held)
    expect(service.getRecoveryStatus().available).toBe(true)
  })

  /**
   * A joined caller's abort cancels only its own await.
   *
   * The replay is one shared operation, but a caller's `signal` is caller-scoped: aborting it
   * must not tear down a replay another caller is still awaiting. The slot also stays owned until
   * the shared operation settles, so an aborting caller cannot free the audio for a second
   * provider upload.
   */
  it('cancels only the aborting caller while the shared replay still delivers to the other', async () => {
    const service = new VoiceService()
    await runUntilFailure(service)

    const firstController = new AbortController()
    const fakeRetry = createFakeConnection('retry words')
    let releaseConnection!: (connection: FakeVoiceConnection) => void
    const gate = new Promise<FakeVoiceConnection>((resolve) => {
      releaseConnection = resolve
    })
    provider.createStream.mockClear()
    provider.createStream.mockImplementationOnce(() => gate)

    const first = service.retryLastFailure({ delivery: 'active-app' }, firstController.signal)
    const second = service.retryLastFailure({ delivery: 'active-app' })
    // The shared replay is parked on its connection gate, so it cannot have delivered yet.
    await vi.advanceTimersByTimeAsync(0)

    firstController.abort()
    await expect(first).rejects.toThrow('VOICE_OPERATION_CANCELLED')

    // The slot is still owned by the live shared replay: a later caller joins it rather than
    // starting a second provider upload.
    const third = service.retryLastFailure({ delivery: 'active-app' })
    await vi.advanceTimersByTimeAsync(0)
    expect(provider.createStream).toHaveBeenCalledOnce()

    releaseConnection(fakeRetry.connection)
    const secondResult = await second
    const thirdResult = await third

    // The aborting caller never took the replay down with it: one upload, one delivery.
    expect(secondResult.text).toBe('retry words')
    expect(thirdResult).toBe(secondResult)
    expect(provider.createStream).toHaveBeenCalledOnce()
    expect(fakeRetry.connection.end).toHaveBeenCalledOnce()
    expect(typeText).toHaveBeenCalledTimes(1)
    expect(typeText).toHaveBeenCalledWith('retry words')
  })
})

/**
 * The affordance that makes the recovery window reachable at all.
 *
 * Without a way to ask after the pill has collapsed, audio held past those five seconds has
 * no entry point — and retention nothing can reach is just retention.
 */
describe('VoiceService recovery status', () => {
  let fake: ReturnType<typeof createFakeConnection>

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    support.mockReturnValue({ supported: true, platform: 'darwin' })
    startCapture.mockResolvedValue({ sessionId: 's1' })
    drainCapture.mockReturnValue({ pcm: pcm(16_384), sampleRate: 16000, channels: 1 })
    pollCapture.mockReturnValue({ active: true, durationMs: 0, stoppedReason: null })
    invoke.mockResolvedValue({ result: 'Hello world.' })
    getMainConfig.mockReturnValue({ voiceInput: { polishStrength: 'deep' } })
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

  async function cancelAfterSpeaking(service: VoiceService): Promise<void> {
    const controller = new AbortController()
    const generator = service.streamDictation({}, controller.signal)
    const drained = (async () => {
      try {
        for await (const _event of generator) {
          // drain
        }
      } catch {
        // the cancellation under test
      }
    })()
    await vi.advanceTimersByTimeAsync(400)
    controller.abort()
    await vi.advanceTimersByTimeAsync(300)
    await drained
  }

  it('reports nothing to recover before anything has run', () => {
    expect(new VoiceService().getRecoveryStatus()).toEqual({ available: false })
  })

  it('names why the recording survived, and how long is left', async () => {
    const service = new VoiceService()
    await cancelAfterSpeaking(service)

    const status = service.getRecoveryStatus()
    expect(status.available).toBe(true)
    expect(status.kind).toBe('cancelled')
    // A countdown, not a boolean: an action that expires mid-click is worse than no action.
    // Asserted against the near-full window — `> 0` would pass on a hardcoded constant.
    expect(status.expiresInMs).toBeGreaterThan(14_000)
    expect(status.expiresInMs).toBeLessThanOrEqual(30_000)
  })

  it('distinguishes a failure from a cancel', async () => {
    const service = new VoiceService()
    const generator = service.streamDictation({})
    const drained = (async () => {
      try {
        for await (const _event of generator) {
          // drain
        }
      } catch {
        // the failure under test
      }
    })()
    await vi.advanceTimersByTimeAsync(300)
    fake.fail(new Error('provider socket closed'))
    await vi.advanceTimersByTimeAsync(500)
    await drained

    expect(service.getRecoveryStatus().kind).toBe('failed')
  })

  it('stops offering recovery once the window closes', async () => {
    const service = new VoiceService()
    await cancelAfterSpeaking(service)
    await vi.advanceTimersByTimeAsync(30_001)

    expect(service.getRecoveryStatus()).toEqual({ available: false })
  })

  /**
   * The clock, not the timer.
   *
   * The expiry timer is the normal mechanism, which means a status check that trusted it
   * alone would pass even with the deadline comparison removed. Moving the wall clock past
   * the deadline without running timers is what actually exercises the guard — and it is not
   * hypothetical: the timer is unref'd, so a sleeping or throttled process can reach this.
   */
  it('refuses an expired recording even if its timer has not fired', async () => {
    const service = new VoiceService()
    await cancelAfterSpeaking(service)
    expect(service.getRecoveryStatus().available).toBe(true)

    vi.setSystemTime(Date.now() + 15_001)
    expect(service.getRecoveryStatus()).toEqual({ available: false })
  })

  /**
   * The normal end of the window, and the reason the timer above is only a backstop: the HUD
   * says the offer has left the screen, and ten megabytes of what the user just said should not
   * outlive the button that could have spent it.
   */
  it('drops the recording the moment the UI says its offer is gone', async () => {
    const service = new VoiceService()
    await cancelAfterSpeaking(service)
    expect(service.getRecoveryStatus().available).toBe(true)

    service.discardRecovery()

    expect(service.getRecoveryStatus()).toEqual({ available: false })
    expect((service as unknown as { retryBuffer: unknown | null }).retryBuffer).toBeNull()
    // A surface that reports the same dismissal twice is not an error.
    expect(() => service.discardRecovery()).not.toThrow()
  })

  /**
   * A session start is a dismissal too: the user has moved on, and nothing on screen points at
   * the previous recording any more. Cleared at the entry point rather than where capture
   * begins, so a session that dies before its first byte still takes the old audio with it.
   */
  it('clears the previous recording as soon as the next session starts', async () => {
    const service = new VoiceService()
    await cancelAfterSpeaking(service)
    expect(service.getRecoveryStatus().available).toBe(true)

    // Fails on the unsupported check, which is upstream of everything that touches the buffer:
    // if the entry point does not clear it, the previous recording survives into the next
    // session. Aborting instead would not prove it — that path still reaches the capture setup,
    // which replaces the slot on its own.
    support.mockReturnValueOnce({ supported: false, reason: 'no device' })
    await expect(service.streamDictation({}).next()).rejects.toThrow('Voice capture is unavailable')

    expect(service.getRecoveryStatus()).toEqual({ available: false })
  })

  /**
   * The first session of a run has nothing to have switched from, so it says nothing — a HUD
   * that announces the microphone every single time is noise, and noise is what people learn to
   * stop reading. The announcement only exists to answer "which one is live now" after it moved.
   */
  async function sessionOn(service: VoiceService, deviceName: string): Promise<string[]> {
    startCapture.mockResolvedValue({ sessionId: 's1', deviceName })
    pollCapture.mockReturnValueOnce({ active: true, durationMs: 100, stoppedReason: null })
    pollCapture.mockReturnValue({ active: false, durationMs: 200, stoppedReason: 'silence' })
    const events = await drainStream(service.streamDictation({}))
    return events.flatMap((event) => (event.type === 'device' ? [event.name] : []))
  }

  it('announces a microphone only once it is a different one', async () => {
    const service = new VoiceService()

    expect(await sessionOn(service, 'MacBook Pro Microphone')).toEqual([])
    expect(await sessionOn(service, 'AirPods Pro')).toEqual(['AirPods Pro'])
    // Same hardware again: nothing to report, and the notice does not repeat itself.
    expect(await sessionOn(service, 'AirPods Pro')).toEqual([])
  })

  /**
   * A platform that will not name the device reports an empty string. That is not a switch, and
   * it must not overwrite the name we do know — otherwise the next real session would announce
   * a device the user never changed.
   */
  it('treats an unnamed device as no news rather than as a change', async () => {
    const service = new VoiceService()

    expect(await sessionOn(service, 'Studio Display Microphone')).toEqual([])
    expect(await sessionOn(service, '')).toEqual([])
    expect(await sessionOn(service, 'Studio Display Microphone')).toEqual([])
  })

  it('offers nothing after a successful session', async () => {
    pollCapture.mockReturnValueOnce({ active: true, durationMs: 100, stoppedReason: null })
    pollCapture.mockReturnValue({ active: false, durationMs: 200, stoppedReason: 'silence' })
    const service = new VoiceService()
    await drainStream(service.streamDictation({}))

    expect(service.getRecoveryStatus()).toEqual({ available: false })
  })
})

/**
 * A recovered recording is a recognition in its own right, so the row it leaves in the history
 * has to read like one: the audio the replay actually uploaded, the transcript the adapter
 * produced before any polishing, the adapter and model that produced it — and, once it
 * succeeds, none of the failure it replaced.
 *
 * History is switched on for this suite alone, because the record only exists for a user who
 * keeps one; every other suite here leaves it off and observes a retry through the buffer.
 */
describe('VoiceService retry recognition record', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    support.mockReturnValue({ supported: true, platform: 'darwin' })
    startCapture.mockResolvedValue({ sessionId: 's1' })
    drainCapture.mockReturnValue({ pcm: pcm(16_384), sampleRate: 16000, channels: 1 })
    invoke.mockResolvedValue({ result: 'Hello world.' })
    typeText.mockReturnValue({ ok: true })
    isAccessibilityTrusted.mockReturnValue(true)
    getActiveApp.mockResolvedValue({
      identifier: 'com.example.editor',
      displayName: 'Editor',
      bundleId: 'com.example.editor',
      processId: 123,
      executablePath: null,
      platform: 'macos',
      windowTitle: null,
      lastUpdated: Date.now()
    })
    getMainConfig.mockReturnValue({
      voiceInput: { polishStrength: 'deep', historyEnabled: true }
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  /**
   * A session that speaks, fails, and leaves audio behind to recover. `fail` is the lever that
   * ends it, so each test can name the failure its own history row starts from.
   */
  async function failCapture(service: VoiceService, fail: (error: Error) => void): Promise<void> {
    pollCapture.mockReturnValue({ active: true, durationMs: 0, stoppedReason: null })
    const generator = service.streamDictation({ emitLevel: false })
    const drained = (async () => {
      try {
        for await (const _event of generator) {
          // drain
        }
      } catch {
        // the failure under test
      }
    })()
    await vi.advanceTimersByTimeAsync(300)
    fail(Object.assign(new Error('provider socket closed'), { code: 'VOICE_ASR_PROVIDER_FAILED' }))
    await vi.advanceTimersByTimeAsync(500)
    await drained
  }

  /** Every row the service handed to the history, in the order it wrote them. */
  function recordWrites(): VoiceRecognitionRecordInput[] {
    return recognitionStoreMocks.record.mock.calls.map(([input]) => input)
  }

  async function failingService() {
    const fake = createFakeConnection()
    const provider = { createStream: vi.fn(async () => fake.connection) }
    resolveAsrProvider.mockReturnValue({
      model: 'fake-model',
      provider: { id: 'fake', defaultStreamModel: 'fake-model', ...provider }
    })
    const service = new VoiceService()
    await failCapture(service, fake.fail)
    return { service, provider }
  }

  it('records the replayed audio, the raw transcript and the adapter that produced it', async () => {
    const { service, provider } = await failingService()

    const retry = createFakeConnection(POLISHABLE_TRANSCRIPT, false)
    retry.push({ type: 'final', text: POLISHABLE_TRANSCRIPT, language: 'en', latencyMs: 42 })
    let releaseConnection!: () => void
    provider.createStream.mockImplementationOnce(async () => {
      await new Promise<void>((resolve) => {
        releaseConnection = resolve
      })
      return retry.connection
    })

    const replay = service.retryLastFailure({ delivery: 'active-app' })
    // The clock moves while the handshake is still outstanding, so the span the record reports
    // can only be the replay's own attempt.
    await vi.advanceTimersByTimeAsync(1_200)
    releaseConnection()
    expect((await replay).text).toBe('Hello world.')

    // One row for the attempt that failed, one for the replay that replaced it.
    const writes = recordWrites()
    expect(writes).toHaveLength(2)
    const recovered = writes[1]
    expect(recovered).toMatchObject({
      status: 'success',
      source: 'microphone',
      audioFormat: 'pcm',
      audioSampleRate: 16_000,
      // The transcript the adapter returned, kept beside the polished text it was delivered as.
      rawText: POLISHABLE_TRANSCRIPT,
      text: 'Hello world.',
      providerId: 'fake',
      model: 'fake-model',
      channel: 'fake',
      providerLatencyMs: 42,
      errorCode: null
    })

    // A millisecond of this stream is 32 bytes — 16 kHz, 16-bit mono, the format the request
    // declared — and the byte count is the audio the replay actually uploaded, not a leftover.
    const replayedBytes = retry.connection.writePcm.mock.calls.reduce(
      (total, [chunk]) => total + chunk.length,
      0
    )
    expect(replayedBytes).toBeGreaterThan(0)
    expect(recovered?.audioBytes).toBe(replayedBytes)
    expect(recovered?.audioDurationMs).toBe(Math.round(replayedBytes / 32))

    // Timed from the replay, not from the capture it replaced: the failed attempt occupies 800
    // fake milliseconds of this test, so a span inherited from its start would run past 2s.
    expect(recovered?.recognitionDurationMs).toBeGreaterThanOrEqual(1_200)
    expect(recovered?.recognitionDurationMs).toBeLessThan(2_000)
  })

  it('rewrites the failed row as a success with no error code left beside it', async () => {
    const { service, provider } = await failingService()

    const retry = createFakeConnection('buffered words')
    provider.createStream.mockResolvedValueOnce(retry.connection)
    await service.retryLastFailure()

    const [failedAttempt, recovered] = recordWrites()
    // The row the recovery replaces: the same capture, carrying the code the failure named.
    expect(failedAttempt).toMatchObject({
      status: 'failed',
      errorCode: 'VOICE_ASR_PROVIDER_FAILED'
    })
    // And the row it becomes: a success with nothing left of that failure.
    expect(recovered).toMatchObject({ status: 'success', errorCode: null })
    expect(recovered?.id).toBe(failedAttempt?.id)
  })

  it('leaves the provider latency absent when the provider measured none', async () => {
    const { service, provider } = await failingService()

    const retry = createFakeConnection('buffered words')
    provider.createStream.mockResolvedValueOnce(retry.connection)
    await service.retryLastFailure()

    // A recovery has a round trip of its own to measure, but a provider that reports none leaves
    // the field off the row rather than writing a zero that claims an instant request.
    const recovered = recordWrites()[1]
    expect(recovered).toMatchObject({ status: 'success', text: 'buffered words' })
    expect(recovered).not.toHaveProperty('providerLatencyMs')
  })
})
