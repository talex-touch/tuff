import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const voiceInsightsMocks = vi.hoisted(() => ({ recordSuccess: vi.fn(async () => undefined) }))

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
  getConfiguredAsrProvider: vi.fn()
}))

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
  voiceInsightsStore: { recordSuccess: voiceInsightsMocks.recordSuccess }
}))

import * as nativeAudio from '@talex-touch/tuff-native/audio'
import type { VoiceProviderEvent } from '@talex-touch/tuff-voice'
import type { VoiceAsrStreamEvent } from '@talex-touch/utils/transport/sdk/domains/voice'
import { clipboardModule } from '../clipboard'
import { activeAppService } from '../system/active-app'
import { tuffIntelligence } from '../ai/intelligence-sdk'
import { getConfiguredAsrProvider } from './voice-provider-runtime'
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

/** 16-bit LE mono PCM at a constant amplitude, so the expected RMS is exact. */
function pcm(amplitude: number, samples = 160): Buffer {
  const buffer = Buffer.alloc(samples * 2)
  for (let index = 0; index < samples; index += 1) {
    buffer.writeInt16LE(amplitude, index * 2)
  }
  return buffer
}

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
    writePcm: vi.fn(async () => {
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
      fake = createFakeConnection()
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

  async function runUntilFailure(service: VoiceService): Promise<void> {
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
    fake.fail(new Error('provider socket closed'))
    // Bounded, not runAllTimers: the grace timer is armed by the very failure under test,
    // and draining every pending timer would fire it and report the buffer as expired.
    await vi.advanceTimersByTimeAsync(500)
    await drained
  }

  it('replays retained PCM through the frozen failed ASR adapter without falling back to STT', async () => {
    const service = new VoiceService()
    await runUntilFailure(service)
    const retry = createFakeConnection('buffered words')
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
    const retry = createFakeConnection('cancelled words')
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
