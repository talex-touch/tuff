import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { VoiceProviderEvent, VoiceStreamRequest } from '@talex-touch/tuff-voice'
import type { VoiceRecognitionRecord } from '@talex-touch/utils/transport/sdk/domains/voice'
import { pcm16ToWav } from './voice-recognition-store'

const voiceInsightsMocks = vi.hoisted(() => ({
  recordSuccess: vi.fn(async () => undefined),
  recordPolishPass: vi.fn(async () => undefined)
}))

const polishPromptMocks = vi.hoisted(() => ({
  getVoicePolishPrompt: vi.fn((strength: string) => strength),
  wrapTranscription: vi.fn((transcript: string, context?: unknown) =>
    JSON.stringify({ transcription: transcript, context })
  )
}))

const storageMocks = vi.hoisted(() => ({
  getMainConfig: vi.fn()
}))

const recognitionStoreMocks = vi.hoisted(() => ({
  record: vi.fn(async () => undefined),
  getStoredRow: vi.fn(),
  getRecord: vi.fn(),
  readRetainedAudio: vi.fn(),
  updateRetryResult: vi.fn()
}))

vi.mock('@talex-touch/tuff-native/audio', () => ({
  getNativeAudioSupport: vi.fn(() => ({ supported: true, platform: 'darwin' })),
  startCapture: vi.fn(async () => ({ sessionId: 's-retry-test' })),
  pollCapture: vi.fn(() => ({ active: true, durationMs: 0, stoppedReason: null })),
  snapshotCapture: vi.fn(),
  stopCapture: vi.fn(() => ({
    audio: Buffer.alloc(200),
    format: 'wav',
    sampleRate: 16_000,
    channels: 1,
    durationMs: 1_000,
    stoppedReason: 'manual'
  })),
  cancelCapture: vi.fn(),
  playAudio: vi.fn(),
  drainCapture: vi.fn(() => ({ pcm: Buffer.alloc(640, 10), sampleRate: 16_000, channels: 1 })),
  typeText: vi.fn(() => ({ ok: true })),
  isAccessibilityTrusted: vi.fn(() => true)
}))

vi.mock('./voice-provider-runtime', () => ({
  getConfiguredAsrProvider: vi.fn(),
  getVoiceRecognitionLocation: vi.fn(() => 'cloud')
}))

vi.mock('./polish-prompt', () => ({
  getVoicePolishPrompt: polishPromptMocks.getVoicePolishPrompt,
  wrapTranscription: polishPromptMocks.wrapTranscription
}))

vi.mock('../storage', () => ({ getMainConfig: storageMocks.getMainConfig }))

vi.mock('../clipboard', () => ({
  clipboardModule: { applyVoiceText: vi.fn(async () => ({ success: true })) }
}))

vi.mock('../system/active-app', () => ({
  activeAppService: { getActiveApp: vi.fn(async () => null) }
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

vi.mock('./voice-recognition-store', async () => {
  const actual = await vi.importActual<typeof import('./voice-recognition-store')>(
    './voice-recognition-store'
  )
  return {
    ...actual,
    voiceRecognitionStore: {
      record: recognitionStoreMocks.record,
      getStoredRow: recognitionStoreMocks.getStoredRow,
      getRecord: recognitionStoreMocks.getRecord,
      readRetainedAudio: recognitionStoreMocks.readRetainedAudio,
      updateRetryResult: recognitionStoreMocks.updateRetryResult
    }
  }
})

import { tuffIntelligence } from '../ai/intelligence-sdk'
import { getConfiguredAsrProvider } from './voice-provider-runtime'
import { VoiceService } from './voice-service'

const resolveAsrProvider = getConfiguredAsrProvider as unknown as ReturnType<typeof vi.fn>
const invoke = tuffIntelligence.invoke as unknown as ReturnType<typeof vi.fn>

function createStreamFake(eventsToEmit: VoiceProviderEvent[]) {
  const receivedRequests: VoiceStreamRequest[] = []
  const writePcm = vi.fn(async () => undefined)
  const end = vi.fn(async () => undefined)
  const abort = vi.fn(async () => undefined)
  const createStream = vi.fn(async (req: VoiceStreamRequest) => {
    receivedRequests.push(req)
    return {
      events: (async function* () {
        for (const event of eventsToEmit) yield event
      })(),
      writePcm,
      end,
      abort
    }
  })
  return { createStream, receivedRequests, writePcm, end, abort }
}

const LONG_TRANSCRIPT =
  'We deployed SGLang and Qwen3 across the production cluster to benchmark streaming recognition latency'

describe('VoiceService.retryRecord (Option A retained local audio re-transcription)', () => {
  const wavBuffer = pcm16ToWav(Buffer.alloc(3_200, 12), 16_000)

  beforeEach(() => {
    vi.clearAllMocks()
    storageMocks.getMainConfig.mockReturnValue({
      voiceInput: {
        historyEnabled: true,
        historyRetention: '30d',
        polishEnabled: true,
        polishStrength: 'natural',
        customWords: ['vLLM'],
        dictionaryEntries: [
          { term: 'SGLang', source: 'manual', createdAt: 10 },
          { term: 'Qwen3', source: 'auto', createdAt: 20 }
        ]
      }
    })
    invoke.mockResolvedValue({ result: `${LONG_TRANSCRIPT}.` })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('re-transcribes retained WAV applying merged dictionary hotwords and updates the record atomically', async () => {
    const fake = createStreamFake([
      { type: 'final', text: LONG_TRANSCRIPT, latencyMs: 85, usage: { totalTokens: 18 } }
    ])
    resolveAsrProvider.mockReturnValue({
      model: 'paraformer-realtime-v2',
      mode: 'buffered',
      location: 'cloud',
      provider: { id: 'bailian', createStream: fake.createStream }
    })
    recognitionStoreMocks.getStoredRow.mockResolvedValue({
      id: 'rec-1',
      capturedAt: 1_700_000_000_000,
      source: 'ask',
      status: 'failed',
      audioPath: '/tmp/voice/recordings/rec-1.wav',
      audioDurationMs: 1_500
    })
    recognitionStoreMocks.readRetainedAudio.mockResolvedValue({
      ok: true,
      buffer: wavBuffer,
      ext: 'wav',
      canonicalPath: '/tmp/voice/recordings/rec-1.wav'
    })
    const updatedDto: VoiceRecognitionRecord = {
      id: 'rec-1',
      capturedAt: 1_700_000_000_000,
      source: 'ask',
      status: 'success',
      recognitionLocation: 'cloud',
      audioUrl: 'tfile:///tmp/voice/recordings/rec-1.wav',
      rawText: LONG_TRANSCRIPT,
      text: `${LONG_TRANSCRIPT}.`,
      providerId: 'bailian',
      model: 'paraformer-realtime-v2'
    }
    recognitionStoreMocks.updateRetryResult.mockResolvedValue(updatedDto)

    const result = await new VoiceService().retryRecord({ recordId: 'rec-1' })

    expect(result).toEqual({ status: 'success', record: updatedDto })
    expect(fake.receivedRequests[0]?.hotwords?.slice(0, 3)).toEqual(['SGLang', 'Qwen3', 'vLLM'])
    expect(fake.writePcm).toHaveBeenCalled()
    expect(polishPromptMocks.wrapTranscription).toHaveBeenCalledWith(
      LONG_TRANSCRIPT,
      expect.objectContaining({
        vocabulary: expect.arrayContaining(['SGLang', 'Qwen3', 'vLLM'])
      })
    )
    expect(recognitionStoreMocks.updateRetryResult).toHaveBeenCalledWith(
      'rec-1',
      expect.objectContaining({
        status: 'success',
        rawText: LONG_TRANSCRIPT,
        text: `${LONG_TRANSCRIPT}.`,
        errorCode: null,
        providerId: 'bailian',
        model: 'paraformer-realtime-v2',
        providerLatencyMs: 85
      })
    )
    expect(voiceInsightsMocks.recordSuccess).toHaveBeenCalledWith(
      expect.objectContaining({
        captureId: 'rec-1',
        text: `${LONG_TRANSCRIPT}.`,
        polished: true
      })
    )
  })

  it('returns structured VOICE_RECORD_AUDIO_MISSING when local audio was pruned', async () => {
    recognitionStoreMocks.getStoredRow.mockResolvedValue({
      id: 'rec-pruned',
      capturedAt: 1_700_000_000_000,
      source: 'dictate',
      status: 'failed',
      audioPath: '/tmp/voice/recordings/pruned.wav'
    })
    recognitionStoreMocks.readRetainedAudio.mockResolvedValue({
      ok: false,
      code: 'VOICE_RECORD_AUDIO_MISSING'
    })
    recognitionStoreMocks.getRecord.mockResolvedValue({
      id: 'rec-pruned',
      capturedAt: 1_700_000_000_000,
      source: 'dictate',
      status: 'failed'
    })

    const result = await new VoiceService().retryRecord({ recordId: 'rec-pruned' })

    expect(result).toMatchObject({
      status: 'failed',
      errorCode: 'VOICE_RECORD_AUDIO_MISSING',
      retryable: false
    })
    expect(resolveAsrProvider).not.toHaveBeenCalled()
  })

  it('throws coded VOICE_RECORD_AUDIO_PATH_INVALID when path safety validation fails', async () => {
    recognitionStoreMocks.getStoredRow.mockResolvedValue({
      id: 'rec-escape',
      capturedAt: 1_700_000_000_000,
      source: 'dictate',
      status: 'failed',
      audioPath: '/etc/passwd'
    })
    recognitionStoreMocks.readRetainedAudio.mockResolvedValue({
      ok: false,
      code: 'VOICE_RECORD_AUDIO_PATH_INVALID'
    })

    await expect(new VoiceService().retryRecord({ recordId: 'rec-escape' })).rejects.toMatchObject({
      code: 'VOICE_RECORD_AUDIO_PATH_INVALID',
      retryable: false
    })
    expect(resolveAsrProvider).not.toHaveBeenCalled()
  })

  it('deduplicates concurrent retries for the same recordId and handles empty / provider failure', async () => {
    const gate = Promise.withResolvers<void>()
    const createStream = vi.fn(async () => ({
      events: (async function* () {
        await gate.promise
        yield { type: 'final' as const, text: '   ' }
      })(),
      writePcm: vi.fn(async () => undefined),
      end: vi.fn(async () => undefined),
      abort: vi.fn(async () => undefined)
    }))
    resolveAsrProvider.mockReturnValue({
      model: 'whisper-small',
      mode: 'buffered',
      location: 'on-device',
      provider: { id: 'local-whisper', createStream }
    })
    recognitionStoreMocks.getStoredRow.mockResolvedValue({
      id: 'rec-dup',
      capturedAt: 1_700_000_000_000,
      source: 'dictate',
      status: 'failed',
      audioPath: '/tmp/voice/recordings/dup.wav'
    })
    recognitionStoreMocks.readRetainedAudio.mockResolvedValue({
      ok: true,
      buffer: wavBuffer,
      ext: 'wav',
      canonicalPath: '/tmp/voice/recordings/dup.wav'
    })
    recognitionStoreMocks.updateRetryResult.mockResolvedValue({
      id: 'rec-dup',
      capturedAt: 1_700_000_000_000,
      source: 'dictate',
      status: 'empty'
    })

    const service = new VoiceService()
    const first = service.retryRecord({ recordId: 'rec-dup' })
    const second = service.retryRecord({ recordId: 'rec-dup' })
    gate.resolve()

    const [a, b] = await Promise.all([first, second])
    expect(a).toEqual(b)
    expect(a.status).toBe('empty')
    expect(createStream).toHaveBeenCalledTimes(1)
  })

  it('persists dictate and ask sources on cancelled sessions and respects historyRetention off', async () => {
    vi.useFakeTimers()
    const createStream = vi.fn(async () => ({
      events: (async function* () {
        // never yields before cancel
      })(),
      writePcm: vi.fn(async () => undefined),
      end: vi.fn(async () => undefined),
      abort: vi.fn(async () => undefined)
    }))
    resolveAsrProvider.mockReturnValue({
      model: 'fake-model',
      mode: 'realtime',
      location: 'cloud',
      provider: { id: 'fake', createStream }
    })

    const drainToError = async (
      gen: AsyncGenerator<unknown>,
      controller: AbortController
    ): Promise<unknown> => {
      const task = (async () => {
        for await (const _event of gen) {
          // wait until cancelled
        }
      })()
      const caught = task.catch((error: unknown) => error)
      await vi.advanceTimersByTimeAsync(120)
      controller.abort()
      await vi.runAllTimersAsync()
      return await caught
    }

    const service = new VoiceService()
    const cancelAsk = new AbortController()
    const askError = await drainToError(
      service.streamDictation({ source: 'ask' }, cancelAsk.signal),
      cancelAsk
    )
    expect(askError).toMatchObject({ message: 'VOICE_OPERATION_CANCELLED' })

    expect(recognitionStoreMocks.record).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'ask',
        status: 'cancelled',
        errorCode: 'VOICE_OPERATION_CANCELLED'
      })
    )

    // When historyRetention is 'off', no record is written
    recognitionStoreMocks.record.mockClear()
    storageMocks.getMainConfig.mockReturnValue({
      voiceInput: { historyEnabled: true, historyRetention: 'off' }
    })
    const cancelOff = new AbortController()
    const offError = await drainToError(
      service.streamDictation({ source: 'dictate' }, cancelOff.signal),
      cancelOff
    )
    expect(offError).toMatchObject({ message: 'VOICE_OPERATION_CANCELLED' })
    expect(recognitionStoreMocks.record).not.toHaveBeenCalled()
  })
})
