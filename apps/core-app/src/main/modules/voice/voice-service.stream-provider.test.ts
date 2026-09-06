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
const resolveProvider = getVoiceProvider as unknown as ReturnType<typeof vi.fn>

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

  const connection = {
    events,
    writePcm: vi.fn(async () => {}),
    end: vi.fn(async () => {
      push({ type: 'final', text: finalText, language: 'en' })
      close()
    }),
    abort: vi.fn(async () => {
      close()
    })
  }

  return { connection, push }
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
