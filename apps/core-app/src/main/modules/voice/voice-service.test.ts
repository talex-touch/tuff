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

vi.mock('electron', () => ({
  clipboard: { writeText: vi.fn() }
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
import { clipboard } from 'electron'
import { tuffIntelligence } from '../ai/intelligence-sdk'
import { intelligenceTtsService } from '../ai/intelligence-tts-service'
import type { VoiceAsrStreamEvent } from '@talex-touch/utils/transport/sdk/domains/voice'
import { VoiceService } from './voice-service'

const support = nativeAudio.getNativeAudioSupport as unknown as ReturnType<typeof vi.fn>
const startCapture = nativeAudio.startCapture as unknown as ReturnType<typeof vi.fn>
const pollCapture = nativeAudio.pollCapture as unknown as ReturnType<typeof vi.fn>
const snapshotCapture = nativeAudio.snapshotCapture as unknown as ReturnType<typeof vi.fn>
const stopCapture = nativeAudio.stopCapture as unknown as ReturnType<typeof vi.fn>
const playAudio = (nativeAudio as unknown as { playAudio: ReturnType<typeof vi.fn> }).playAudio
const typeText = (nativeAudio as unknown as { typeText: ReturnType<typeof vi.fn> }).typeText
const isAccessibilityTrusted = (
  nativeAudio as unknown as { isAccessibilityTrusted: ReturnType<typeof vi.fn> }
).isAccessibilityTrusted
const clipboardWrite = (clipboard as unknown as { writeText: ReturnType<typeof vi.fn> }).writeText
const stt = tuffIntelligence.audio.stt as unknown as ReturnType<typeof vi.fn>
const invoke = tuffIntelligence.invoke as unknown as ReturnType<typeof vi.fn>
const ttsSpeak = intelligenceTtsService.speak as unknown as ReturnType<typeof vi.fn>

function wav(bytes = 200): Buffer {
  return Buffer.alloc(bytes)
}

describe('VoiceService.dictate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    support.mockReturnValue({ supported: true, platform: 'darwin' })
    startCapture.mockReturnValue({ sessionId: 's1' })
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

  it('skips polish when cleanup is false', async () => {
    stt.mockResolvedValue({ result: { text: 'raw text' } })

    const result = await new VoiceService().dictate({ cleanup: false })

    expect(result.text).toBe('raw text')
    expect(result.polished).toBe(false)
    expect(invoke).not.toHaveBeenCalled()
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

describe('VoiceService.streamDictation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    support.mockReturnValue({ supported: true, platform: 'darwin' })
    startCapture.mockReturnValue({ sessionId: 's1' })
    snapshotCapture.mockReturnValue({ audio: wav(), durationMs: 1000 })
    stopCapture.mockReturnValue({
      audio: wav(),
      format: 'wav',
      sampleRate: 16000,
      channels: 1,
      durationMs: 2000,
      stoppedReason: 'silence'
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

  it('emits live partials, a polished final, then end', async () => {
    // active for the first interval, then auto-stopped.
    pollCapture.mockReturnValueOnce({ active: true, durationMs: 1000, stoppedReason: null })
    pollCapture.mockReturnValue({ active: false, durationMs: 2000, stoppedReason: 'silence' })
    // partial#1, partial#2, then the final transcription.
    stt.mockResolvedValueOnce({ result: { text: 'hello' } })
    stt.mockResolvedValueOnce({ result: { text: 'hello world' } })
    stt.mockResolvedValue({ result: { text: 'hello world', language: 'en' } })
    invoke.mockResolvedValue({ result: 'Hello world.' })

    const events = await collect(new VoiceService().streamDictation({ language: 'en' }))

    const partials = events.filter((e) => e.type === 'partial')
    expect(partials.length).toBeGreaterThanOrEqual(1)
    const final = events.find((e) => e.type === 'final')
    expect(final).toMatchObject({ type: 'final', text: 'Hello world.', language: 'en' })
    expect(events.at(-1)).toEqual({ type: 'end' })
  })

  it('does not let a failed interim transcription kill the stream', async () => {
    pollCapture.mockReturnValueOnce({ active: true, durationMs: 1000, stoppedReason: null })
    pollCapture.mockReturnValue({ active: false, durationMs: 2000, stoppedReason: 'silence' })
    // interim rejects, final resolves.
    stt.mockRejectedValueOnce(new Error('interim boom'))
    stt.mockResolvedValue({ result: { text: 'final text' } })
    invoke.mockResolvedValue({ result: 'Final text' })

    const events = await collect(new VoiceService().streamDictation())

    const final = events.find((e) => e.type === 'final')
    expect(final).toMatchObject({ type: 'final', text: 'Final text' })
    expect(events.at(-1)).toEqual({ type: 'end' })
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

  it('skips playback when play is false', async () => {
    const result = await new VoiceService().speak({ text: 'hello', play: false })

    expect(result.played).toBe(false)
    expect(playAudio).not.toHaveBeenCalled()
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

describe('VoiceService.injectText', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('uses enigo when accessibility is trusted', () => {
    isAccessibilityTrusted.mockReturnValue(true)
    typeText.mockReturnValue({ ok: true })

    const result = new VoiceService().injectText('hello world')

    expect(result.method).toBe('enigo')
    expect(typeText).toHaveBeenCalledWith('hello world')
    expect(clipboardWrite).not.toHaveBeenCalled()
  })

  it('falls back to clipboard when accessibility is not trusted', () => {
    isAccessibilityTrusted.mockReturnValue(false)

    const result = new VoiceService().injectText('hello')

    expect(result.method).toBe('clipboard')
    expect(result.reason).toBe('accessibility-required')
    expect(typeText).not.toHaveBeenCalled()
    expect(clipboardWrite).toHaveBeenCalledWith('hello')
  })

  it('falls back to clipboard when enigo fails', () => {
    isAccessibilityTrusted.mockReturnValue(true)
    typeText.mockReturnValue({ ok: false, reason: 'boom' })

    const result = new VoiceService().injectText('hello')

    expect(result.method).toBe('clipboard')
    expect(result.reason).toBe('boom')
    expect(clipboardWrite).toHaveBeenCalledWith('hello')
  })

  it('returns none for empty text', () => {
    const result = new VoiceService().injectText('   ')
    expect(result.method).toBe('none')
    expect(typeText).not.toHaveBeenCalled()
    expect(clipboardWrite).not.toHaveBeenCalled()
  })
})

describe('VoiceService toggle capture', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    support.mockReturnValue({ supported: true, platform: 'darwin' })
    startCapture.mockReturnValue({ sessionId: 't1' })
    stopCapture.mockReturnValue({
      audio: wav(),
      format: 'wav',
      sampleRate: 16000,
      channels: 1,
      durationMs: 3000,
      stoppedReason: 'manual'
    })
  })

  it('beginCapture starts native capture and returns a session id', () => {
    const id = new VoiceService().beginCapture()
    expect(id).toBe('t1')
    expect(startCapture).toHaveBeenCalledTimes(1)
  })

  it('endCapture stops, transcribes, and polishes', async () => {
    stt.mockResolvedValue({ result: { text: 'raw dictation', language: 'en' } })
    invoke.mockResolvedValue({ result: 'Raw dictation.' })

    const result = await new VoiceService().endCapture('t1', { cleanup: true })

    expect(result.raw).toBe('raw dictation')
    expect(result.text).toBe('Raw dictation.')
    expect(result.language).toBe('en')
  })

  it('endCapture returns empty when no audio was captured', async () => {
    stopCapture.mockReturnValue({
      audio: Buffer.alloc(0),
      format: 'wav',
      sampleRate: 16000,
      channels: 1,
      durationMs: 0,
      stoppedReason: 'manual'
    })
    const result = await new VoiceService().endCapture('t1')
    expect(result.text).toBe('')
    expect(stt).not.toHaveBeenCalled()
  })
})
