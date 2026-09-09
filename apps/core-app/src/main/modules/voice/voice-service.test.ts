import { beforeEach, describe, expect, it, vi } from 'vitest'

const nativeAudioMock = vi.hoisted(() => ({
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

vi.mock('@talex-touch/tuff-native/audio', () => nativeAudioMock)

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
  voiceInsightsStore: { recordSuccess: vi.fn(async () => undefined) }
}))
vi.mock('./voice-provider-runtime', () => ({
  getConfiguredAsrProvider: vi.fn()
}))

import * as nativeAudio from '@talex-touch/tuff-native/audio'
import { clipboardModule } from '../clipboard'
import { activeAppService } from '../system/active-app'
import { tuffIntelligence } from '../ai/intelligence-sdk'
import { intelligenceTtsService } from '../ai/intelligence-tts-service'
import { VoiceService } from './voice-service'

const support = nativeAudio.getNativeAudioSupport as unknown as ReturnType<typeof vi.fn>
const startCapture = nativeAudio.startCapture as unknown as ReturnType<typeof vi.fn>
const pollCapture = nativeAudio.pollCapture as unknown as ReturnType<typeof vi.fn>
const stopCapture = nativeAudio.stopCapture as unknown as ReturnType<typeof vi.fn>
const cancelCapture = nativeAudio.cancelCapture as unknown as ReturnType<typeof vi.fn>
const playAudio = (nativeAudio as unknown as { playAudio: ReturnType<typeof vi.fn> }).playAudio
const ttsSpeak = intelligenceTtsService.speak as unknown as ReturnType<typeof vi.fn>
const typeText = (nativeAudio as unknown as { typeText: ReturnType<typeof vi.fn> }).typeText
const isAccessibilityTrusted = (
  nativeAudio as unknown as { isAccessibilityTrusted: ReturnType<typeof vi.fn> }
).isAccessibilityTrusted
const applyVoiceText = clipboardModule.applyVoiceText as unknown as ReturnType<typeof vi.fn>
const getActiveApp = activeAppService.getActiveApp as unknown as ReturnType<typeof vi.fn>
const stt = tuffIntelligence.audio.stt as unknown as ReturnType<typeof vi.fn>
const invoke = tuffIntelligence.invoke as unknown as ReturnType<typeof vi.fn>
function wav(bytes = 200): Buffer {
  return Buffer.alloc(bytes)
}

describe('VoiceService.dictate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    support.mockReturnValue({ supported: true, platform: 'darwin' })
    startCapture.mockResolvedValue({ sessionId: 's1' })
    pollCapture.mockReturnValue({ active: false, durationMs: 1200, stoppedReason: 'silence' })
    stopCapture.mockReturnValue({
      audio: wav(),
      format: 'wav',
      sampleRate: 16000,
      channels: 1,
      durationMs: 1200,
      stoppedReason: 'silence'
    })
  })

  it('captures, transcribes, and polishes', async () => {
    stt.mockResolvedValue({ result: { text: 'um hello  world', language: 'en' } })
    invoke.mockResolvedValue({ result: 'Hello world' })

    const result = await new VoiceService().dictate({ cleanup: true })

    expect(result.raw).toBe('um hello  world')
    expect(result.text).toBe('Hello world')
    expect(result.polished).toBe(true)
    expect(result.source).toBe('native-cpal')
    expect(result.language).toBe('en')
    expect(invoke).toHaveBeenCalledWith(
      'text.chat',
      expect.objectContaining({ messages: expect.any(Array) }),
      expect.any(Object)
    )
  })

  it('falls back to the raw transcript when polish fails', async () => {
    stt.mockResolvedValue({ result: { text: 'raw text' } })
    invoke.mockRejectedValue(new Error('no provider'))

    const result = await new VoiceService().dictate({ cleanup: true })

    expect(result.text).toBe('raw text')
    expect(result.polished).toBe(false)
  })
  it('propagates caller cancellation into an in-flight polish request', async () => {
    stt.mockResolvedValue({ result: { text: 'raw text' } })
    const polishRequest = Promise.withResolvers<never>()
    let polishSignal: AbortSignal | undefined
    invoke.mockImplementation(
      (_capability: unknown, _payload: unknown, options: { signal?: AbortSignal }) => {
        polishSignal = options.signal
        options.signal?.addEventListener(
          'abort',
          () => polishRequest.reject(new Error('polish cancelled')),
          { once: true }
        )
        return polishRequest.promise
      }
    )
    const controller = new AbortController()
    const pending = new VoiceService().dictate({ cleanup: true }, undefined, controller.signal)

    await vi.waitFor(() => expect(polishSignal).toBeDefined())
    expect(polishSignal?.aborted).toBe(false)

    controller.abort()

    await expect(pending).rejects.toThrow('VOICE_OPERATION_CANCELLED')
    expect(polishSignal?.aborted).toBe(true)
  })

  it('returns raw recognized text when polish reaches its bounded timeout', async () => {
    vi.useFakeTimers()
    stt.mockResolvedValue({ result: { text: 'raw text' } })
    let polishSignal: AbortSignal | undefined
    invoke.mockImplementation(
      (_capability: unknown, _payload: unknown, options: { signal?: AbortSignal }) =>
        new Promise<never>((_resolve, reject) => {
          polishSignal = options.signal
          options.signal?.addEventListener('abort', () => reject(new Error('polish deadline')), {
            once: true
          })
        })
    )
    const pending = new VoiceService().dictate({ cleanup: true })

    await vi.waitFor(() => expect(polishSignal).toBeDefined())
    expect(polishSignal?.aborted).toBe(false)
    await vi.advanceTimersByTimeAsync(1_500)

    await expect(pending).resolves.toMatchObject({
      raw: 'raw text',
      text: 'raw text',
      polished: false
    })
    expect(polishSignal?.aborted).toBe(true)
    vi.useRealTimers()
  })

  it('skips polish when cleanup is false', async () => {
    stt.mockResolvedValue({ result: { text: 'raw text' } })

    const result = await new VoiceService().dictate({ cleanup: false })

    expect(result.text).toBe('raw text')
    expect(result.polished).toBe(false)
    expect(invoke).not.toHaveBeenCalled()
  })

  it('attributes STT and polish to the trusted plugin caller', async () => {
    stt.mockResolvedValue({ result: { text: 'raw text' } })
    invoke.mockResolvedValue({ result: 'Raw text.' })

    await new VoiceService().dictate(
      { cleanup: true },
      undefined,
      undefined,
      'plugin:touch-dictation'
    )

    expect(stt).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ metadata: { caller: 'plugin:touch-dictation' } })
    )
    expect(invoke).toHaveBeenCalledWith(
      'text.chat',
      expect.any(Object),
      expect.objectContaining({ metadata: { caller: 'plugin:touch-dictation' } })
    )
  })

  it('cancels native capture when the owner signal aborts', async () => {
    vi.useFakeTimers()
    pollCapture.mockReturnValue({ active: true, durationMs: 0, stoppedReason: null })
    const controller = new AbortController()
    const pending = new VoiceService().dictate({ cleanup: false }, undefined, controller.signal)
    const cancelled = expect(pending).rejects.toThrow('VOICE_OPERATION_CANCELLED')

    await Promise.resolve()
    controller.abort()
    await vi.runAllTimersAsync()

    await cancelled
    expect(cancelCapture).toHaveBeenCalledWith('s1')
    expect(stt).not.toHaveBeenCalled()
    vi.useRealTimers()
  })

  it('throws when native capture is unsupported', async () => {
    support.mockReturnValue({ supported: false, reason: 'no-input-device' })

    await expect(new VoiceService().dictate()).rejects.toThrow(/no-input-device/)
    expect(startCapture).not.toHaveBeenCalled()
  })

  it('returns an empty result when the transcript is empty', async () => {
    stt.mockResolvedValue({ result: { text: '   ' } })

    const result = await new VoiceService().dictate({ cleanup: true })

    expect(result.text).toBe('')
    expect(result.raw).toBe('')
    expect(invoke).not.toHaveBeenCalled()
  })
})

describe('VoiceService.speak', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    playAudio.mockReturnValue({ playbackId: 'p1' })
    ttsSpeak.mockResolvedValue({
      audio: 'data:audio/wav;base64,QUJD',
      format: 'wav',
      duration: 1.5
    })
  })

  it('synthesizes via TTS and plays through the speakers', async () => {
    const result = await new VoiceService().speak({ text: 'hello', language: 'en' })

    expect(ttsSpeak).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'hello', language: 'en', format: 'wav' })
    )
    expect(result.audio).toBe('data:audio/wav;base64,QUJD')
    expect(result.format).toBe('wav')
    expect(result.played).toBe(true)
    expect(result.durationMs).toBe(1500)
    expect(playAudio).toHaveBeenCalledTimes(1)
  })

  it('attributes synthesis to the trusted plugin caller', async () => {
    await new VoiceService().speak(
      { text: 'hello', play: false },
      undefined,
      'plugin:touch-dictation'
    )

    expect(ttsSpeak).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: { caller: 'plugin:touch-dictation' } })
    )
  })

  it('cancels pending synthesis and never starts playback after abort', async () => {
    let resolveSynthesis!: (value: unknown) => void
    ttsSpeak.mockImplementation(
      async () =>
        await new Promise((resolve) => {
          resolveSynthesis = resolve
        })
    )
    const controller = new AbortController()
    const pending = new VoiceService().speak({ text: 'hello' }, controller.signal)
    const cancelled = expect(pending).rejects.toThrow('VOICE_OPERATION_CANCELLED')

    await Promise.resolve()
    controller.abort()
    await cancelled
    expect(playAudio).not.toHaveBeenCalled()

    resolveSynthesis({ audio: 'data:audio/wav;base64,QUJD', format: 'wav' })
    await Promise.resolve()
  })

  it('skips playback when play is false', async () => {
    const result = await new VoiceService().speak({ text: 'hello', play: false })

    expect(result.played).toBe(false)
    expect(playAudio).not.toHaveBeenCalled()
  })

  it('waits for the native decode instead of inspecting the promise', async () => {
    // playAudio returns a promise since the decode moved to the libuv pool (#845).
    // Without the await, `playback?.playbackId` reads a property off the Promise
    // itself and `played` silently reports false while the audio plays fine.
    playAudio.mockResolvedValue({ playbackId: 'p2' })

    const result = await new VoiceService().speak({ text: 'hello' })

    expect(result.played).toBe(true)
  })

  it('treats a rejected playback the same as a thrown one', async () => {
    // An oversized or undecodable input now arrives as a rejection rather than a
    // synchronous throw. Synthesis still has to survive it and still return audio.
    //
    // This asserts the outcome, not the await — dropping the await produces the
    // same `played: false`, just via an escaped rejection. The test above is the
    // one that catches that.
    playAudio.mockRejectedValue(new Error('audio-too-large: 70000000 bytes'))

    const result = await new VoiceService().speak({ text: 'hello' })

    expect(result.audio).toBe('data:audio/wav;base64,QUJD')
    expect(result.played).toBe(false)
  })

  it('still returns the synthesized audio when playback throws', async () => {
    playAudio.mockImplementation(() => {
      throw new Error('probe-failed')
    })

    const result = await new VoiceService().speak({ text: 'hello' })

    expect(result.audio).toBe('data:audio/wav;base64,QUJD')
    expect(result.played).toBe(false)
  })

  it('throws on empty text', async () => {
    await expect(new VoiceService().speak({ text: '   ' })).rejects.toThrow(/non-empty/)
    expect(ttsSpeak).not.toHaveBeenCalled()
  })
})

describe('VoiceService canonical session', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    support.mockReturnValue({ supported: true, platform: 'darwin' })
    startCapture.mockResolvedValue({ sessionId: 'native-session' })
    stopCapture.mockReturnValue({
      audio: wav(),
      format: 'wav',
      sampleRate: 16000,
      channels: 1,
      durationMs: 3000,
      stoppedReason: 'manual'
    })
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
    applyVoiceText.mockResolvedValue({ success: true })
    isAccessibilityTrusted.mockReturnValue(true)
    typeText.mockReturnValue({ ok: true })
  })

  it('requests 16 kHz native capture for cloud streaming ASR', async () => {
    await new VoiceService().startSession()

    expect(startCapture).toHaveBeenCalledWith(expect.objectContaining({ sampleRate: 16_000 }))
  })

  it('keeps one owner id across start and stop and delivers natively', async () => {
    stt.mockResolvedValue({ result: { text: 'raw dictation', language: 'en' } })
    invoke.mockResolvedValue({ result: 'Raw dictation.' })

    const service = new VoiceService()
    const sessionId = await service.startSession({ delivery: 'active-app' })
    const result = await service.stopSession(sessionId, { cleanup: true })

    expect(result.text).toBe('Raw dictation.')
    expect(result.delivery).toEqual({ method: 'native' })
    expect(typeText).toHaveBeenCalledWith('Raw dictation.')
    expect(applyVoiceText).not.toHaveBeenCalled()
  })

  it('falls back to main-owned auto-paste when native injection is unavailable', async () => {
    stt.mockResolvedValue({ result: { text: 'hello' } })
    isAccessibilityTrusted.mockReturnValue(false)

    const service = new VoiceService()
    const sessionId = await service.startSession({ delivery: 'active-app' })
    const result = await service.stopSession(sessionId, { cleanup: false })

    expect(result.delivery).toEqual({ method: 'autopaste' })
    expect(applyVoiceText).toHaveBeenCalledWith('hello')
    expect(typeText).not.toHaveBeenCalled()
  })

  it('refuses delivery when the active target changes during recognition', async () => {
    stt.mockResolvedValue({ result: { text: 'hello' } })
    getActiveApp
      .mockResolvedValueOnce({
        identifier: 'com.example.editor',
        displayName: 'Editor',
        bundleId: 'com.example.editor',
        processId: 123,
        executablePath: null,
        platform: 'macos',
        windowTitle: null,
        lastUpdated: Date.now()
      })
      .mockResolvedValueOnce({
        identifier: 'com.example.chat',
        displayName: 'Chat',
        bundleId: 'com.example.chat',
        processId: 456,
        executablePath: null,
        platform: 'macos',
        windowTitle: null,
        lastUpdated: Date.now()
      })

    const service = new VoiceService()
    const sessionId = await service.startSession({ delivery: 'active-app' })
    const result = await service.stopSession(sessionId, { cleanup: false })

    expect(result.delivery).toEqual({ method: 'none', reason: 'target-changed' })
    expect(typeText).not.toHaveBeenCalled()
    expect(applyVoiceText).not.toHaveBeenCalled()
  })

  it('cancels all owned native sessions on dispose', async () => {
    const service = new VoiceService()
    await service.startSession()
    service.dispose()

    expect(cancelCapture).toHaveBeenCalledWith('native-session')
    await expect(service.startSession()).rejects.toThrow('VOICE_SESSION_SERVICE_DISPOSED')
  })
})
