import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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
  getVoiceProvider: vi.fn()
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

import * as nativeAudio from '@talex-touch/tuff-native/audio'
import type { VoiceProviderEvent } from '@talex-touch/tuff-voice'
import type { VoiceAsrStreamEvent } from '@talex-touch/utils/transport/sdk/domains/voice'
import { activeAppService } from '../system/active-app'
import { tuffIntelligence } from '../ai/intelligence-sdk'
import { getVoiceProvider } from './voice-provider-runtime'
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
const invoke = tuffIntelligence.invoke as unknown as ReturnType<typeof vi.fn>
const stt = tuffIntelligence.audio.stt as unknown as ReturnType<typeof vi.fn>
const resolveProvider = getVoiceProvider as unknown as ReturnType<typeof vi.fn>

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
function createFakeConnection(finalText = 'hello world') {
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
      push({ type: 'final', text: finalText, language: 'en' })
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
    resolveProvider.mockReturnValue({
      id: 'fake',
      defaultStreamModel: 'fake-model',
      createStream: vi.fn(async () => fake.connection)
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
    resolveProvider.mockReturnValue({
      id: 'fake',
      defaultStreamModel: 'fake-model',
      createStream: vi.fn(async () => fake.connection)
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
    resolveProvider.mockReturnValue({
      id: 'fake',
      defaultStreamModel: 'fake-model',
      createStream: vi.fn(async () => fake.connection)
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
})

/**
 * The retention rules are the feature, not an implementation detail — each one is asserted
 * from the outside, through the only thing that can observe the buffer: whether a retry
 * finds audio or reports it expired.
 */
describe('VoiceService retry buffer retention', () => {
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
    resolveProvider.mockReturnValue({
      id: 'fake',
      defaultStreamModel: 'fake-model',
      createStream: vi.fn(async () => fake.connection)
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

  it('retries the same audio after a failure and delivers the transcript', async () => {
    const service = new VoiceService()
    await runUntilFailure(service)

    stt.mockResolvedValue({ result: { text: 'buffered words', language: 'en' } })
    const result = await service.retryLastFailure({ delivery: 'active-app' })

    expect(result.expired).toBeUndefined()
    expect(result.text).toBe('Hello world.')
    expect(typeText).toHaveBeenCalledWith('Hello world.')
    // The buffered PCM went out as WAV through the same one-shot path, not a second decoder.
    expect(stt).toHaveBeenCalledWith(
      expect.objectContaining({ format: 'wav', audio: expect.stringContaining('data:audio/wav') }),
      expect.any(Object)
    )
  })

  it('reports expiry instead of pretending, once the grace window closes', async () => {
    const service = new VoiceService()
    await runUntilFailure(service)

    await vi.advanceTimersByTimeAsync(30_001)
    const result = await service.retryLastFailure()

    expect(result).toEqual({ text: '', expired: true })
    expect(stt).not.toHaveBeenCalled()
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
  it('keeps the audio after a cancel so undo can restore it', async () => {
    pollCapture.mockReturnValue({ active: true, durationMs: 0, stoppedReason: null })
    stt.mockResolvedValue({ result: { text: 'cancelled words', language: 'en' } })
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

  it('degrades to no retry rather than buffering without bound', async () => {
    // 2.2 MiB per drain: two ticks clear the 4 MiB cap before the failure lands.
    drainCapture.mockReturnValue({ pcm: pcm(16_384, 1_100_000), sampleRate: 16000, channels: 1 })
    stt.mockResolvedValue({ result: { text: 'should never be reached' } })
    const service = new VoiceService()
    await runUntilFailure(service)

    expect(await service.retryLastFailure()).toEqual({ text: '', expired: true })
    expect(stt).not.toHaveBeenCalled()
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
    resolveProvider.mockReturnValue({
      id: 'fake',
      defaultStreamModel: 'fake-model',
      createStream: vi.fn(async () => fake.connection)
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
    expect(status.expiresInMs).toBeGreaterThan(29_000)
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

    vi.setSystemTime(Date.now() + 30_001)
    expect(service.getRecoveryStatus()).toEqual({ available: false })
  })

  it('offers nothing after a successful session', async () => {
    pollCapture.mockReturnValueOnce({ active: true, durationMs: 100, stoppedReason: null })
    pollCapture.mockReturnValue({ active: false, durationMs: 200, stoppedReason: 'silence' })
    const service = new VoiceService()
    await drainStream(service.streamDictation({}))

    expect(service.getRecoveryStatus()).toEqual({ available: false })
  })
})
