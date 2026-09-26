import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { VoiceRecognitionRecordInput } from './voice-recognition-store'

const fileSelection = vi.hoisted(() => ({ selectVoiceFile: vi.fn() }))
const intelligence = vi.hoisted(() => ({ stt: vi.fn(), invoke: vi.fn() }))
const nativeAudio = vi.hoisted(() => ({ typeText: vi.fn(), isAccessibilityTrusted: vi.fn() }))
const storage = vi.hoisted(() => ({ getMainConfig: vi.fn() }))
const recognitionStore = vi.hoisted(() => ({
  record: vi.fn<(input: VoiceRecognitionRecordInput) => Promise<void>>(async () => undefined)
}))

vi.mock('./voice-file-transcription', () => fileSelection)
vi.mock('@talex-touch/tuff-native/audio', () => nativeAudio)
vi.mock('../ai/intelligence-sdk', () => ({
  tuffIntelligence: { audio: { stt: intelligence.stt }, invoke: intelligence.invoke }
}))
vi.mock('../clipboard', () => ({ clipboardModule: { applyVoiceText: vi.fn() } }))
vi.mock('../system/active-app', () => ({ activeAppService: { getActiveApp: vi.fn() } }))
vi.mock('../ai/intelligence-tts-service', () => ({ intelligenceTtsService: { speak: vi.fn() } }))
vi.mock('./voice-insights-store', () => ({ voiceInsightsStore: { recordSuccess: vi.fn() } }))
// The recognition history is the sink this suite observes; the history gate above it is on by
// default only for a user who enabled it, so the file path is exercised with it switched on.
vi.mock('../storage', () => ({ getMainConfig: storage.getMainConfig }))
vi.mock('./voice-recognition-store', () => ({
  voiceRecognitionStore: { record: recognitionStore.record }
}))
vi.mock('./voice-provider-runtime', () => ({
  getConfiguredAsrProvider: vi.fn(),
  getVoiceRecognitionLocation: vi.fn(() => 'cloud')
}))

import { VoiceService } from './voice-service'

async function drain<T>(stream: AsyncGenerator<T>): Promise<T[]> {
  const events: T[] = []
  for await (const event of stream) events.push(event)
  return events
}

const selectedFile = {
  name: 'meeting.m4a',
  format: 'm4a',
  audio: new ArrayBuffer(4)
}

describe('VoiceService local file transcription', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('reports a cancelled dialog without dispatching audio to the STT capability', async () => {
    fileSelection.selectVoiceFile.mockResolvedValue(null)

    await expect(drain(new VoiceService().transcribeFile())).resolves.toEqual([
      { type: 'cancelled' }
    ])
    expect(intelligence.stt).not.toHaveBeenCalled()
  })

  it('exposes selected and final text only, never active-application delivery', async () => {
    fileSelection.selectVoiceFile.mockResolvedValue(selectedFile)
    intelligence.stt.mockResolvedValue({ result: { text: '  meeting notes  ' } })

    await expect(drain(new VoiceService().transcribeFile())).resolves.toEqual([
      { type: 'selected', name: 'meeting.m4a' },
      { type: 'result', text: 'meeting notes' }
    ])
    expect(nativeAudio.typeText).not.toHaveBeenCalled()
  })

  it('forwards the server billing receipt through the file event under its long caller-owned deadline', async () => {
    fileSelection.selectVoiceFile.mockResolvedValue(selectedFile)
    intelligence.stt.mockResolvedValue({
      result: {
        text: 'meeting notes',
        billing: { requestId: 'asr_123', creditsCharged: 12, billedSeconds: 3 }
      }
    })
    const controller = new AbortController()

    await expect(drain(new VoiceService().transcribeFile(controller.signal))).resolves.toEqual([
      { type: 'selected', name: 'meeting.m4a' },
      {
        type: 'result',
        text: 'meeting notes',
        billing: { requestId: 'asr_123', creditsCharged: 12, billedSeconds: 3 }
      }
    ])
    expect(intelligence.stt).toHaveBeenCalledWith(
      { audio: selectedFile.audio, format: 'm4a' },
      expect.objectContaining({
        signal: controller.signal,
        timeout: 600_000,
        metadata: { caller: 'core.voice.file-transcription' }
      })
    )
  })

  it('does not emit a late provider result after the owning caller cancels', async () => {
    fileSelection.selectVoiceFile.mockResolvedValue(selectedFile)
    let receivedSignal: AbortSignal | undefined
    const providerResult = Promise.withResolvers<{ result: { text: string } }>()
    intelligence.stt.mockImplementation((_payload: unknown, options: { signal?: AbortSignal }) => {
      receivedSignal = options.signal
      return providerResult.promise
    })
    const controller = new AbortController()
    const stream = new VoiceService().transcribeFile(controller.signal)

    await expect(stream.next()).resolves.toEqual({
      done: false,
      value: { type: 'selected', name: 'meeting.m4a' }
    })
    const result = stream.next()
    controller.abort()
    expect(receivedSignal?.aborted).toBe(true)
    providerResult.resolve({ result: { text: 'must not surface' } })

    await expect(result).rejects.toThrow('VOICE_OPERATION_CANCELLED')
    await expect(stream.next()).resolves.toEqual({ done: true, value: undefined })
    expect(nativeAudio.typeText).not.toHaveBeenCalled()
  })

  it('records the provider round trip on the file transcription record', async () => {
    fileSelection.selectVoiceFile.mockResolvedValue(selectedFile)
    intelligence.stt.mockResolvedValue({ result: { text: 'meeting notes' }, latency: 42 })
    storage.getMainConfig.mockReturnValue({ voiceInput: { historyEnabled: true } })

    await drain(new VoiceService().transcribeFile())

    expect(recognitionStore.record).toHaveBeenCalledTimes(1)
    expect(recognitionStore.record.mock.calls[0]?.[0]).toMatchObject({
      source: 'file',
      text: 'meeting notes',
      providerLatencyMs: 42
    })
  })

  it('leaves the provider latency off the record when the provider reported no round trip', async () => {
    fileSelection.selectVoiceFile.mockResolvedValue(selectedFile)
    intelligence.stt.mockResolvedValue({ result: { text: 'meeting notes' } })
    storage.getMainConfig.mockReturnValue({ voiceInput: { historyEnabled: true } })

    await drain(new VoiceService().transcribeFile())

    expect(recognitionStore.record).toHaveBeenCalledTimes(1)
    // A recorded zero would claim an instantaneous provider round trip that was never measured.
    expect(recognitionStore.record.mock.calls[0]?.[0]).not.toHaveProperty('providerLatencyMs')
  })
})
