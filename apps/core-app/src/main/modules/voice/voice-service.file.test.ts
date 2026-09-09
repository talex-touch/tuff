import { beforeEach, describe, expect, it, vi } from 'vitest'

const fileSelection = vi.hoisted(() => ({ selectVoiceFile: vi.fn() }))
const intelligence = vi.hoisted(() => ({ stt: vi.fn(), invoke: vi.fn() }))
const nativeAudio = vi.hoisted(() => ({ typeText: vi.fn(), isAccessibilityTrusted: vi.fn() }))

vi.mock('./voice-file-transcription', () => fileSelection)
vi.mock('@talex-touch/tuff-native/audio', () => nativeAudio)
vi.mock('../ai/intelligence-sdk', () => ({
  tuffIntelligence: { audio: { stt: intelligence.stt }, invoke: intelligence.invoke }
}))
vi.mock('../clipboard', () => ({ clipboardModule: { applyVoiceText: vi.fn() } }))
vi.mock('../system/active-app', () => ({ activeAppService: { getActiveApp: vi.fn() } }))
vi.mock('../ai/intelligence-tts-service', () => ({ intelligenceTtsService: { speak: vi.fn() } }))
vi.mock('./voice-insights-store', () => ({ voiceInsightsStore: { recordSuccess: vi.fn() } }))

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
})
