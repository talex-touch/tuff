import type {
  IntelligenceInvokeResult,
  IntelligenceTTSResult
} from '@talex-touch/tuff-intelligence'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { intelligenceTtsService } from './intelligence-tts-service'
import { tuffIntelligence } from './intelligence-sdk'

vi.mock('./intelligence-sdk', () => ({
  tuffIntelligence: {
    invoke: vi.fn()
  }
}))

const invokeMock = vi.mocked(tuffIntelligence.invoke)

function createTtsResult(overrides: Partial<IntelligenceInvokeResult<IntelligenceTTSResult>> = {}) {
  return {
    result: {
      audio: 'ZmFrZS1hdWRpbw==',
      format: 'mp3'
    },
    usage: { promptTokens: 1, completionTokens: 0, totalTokens: 1 },
    model: 'tts-1',
    latency: 10,
    traceId: 'trace-tts',
    provider: 'openai-default',
    ...overrides
  } satisfies IntelligenceInvokeResult<IntelligenceTTSResult>
}

afterEach(() => {
  vi.clearAllMocks()
  intelligenceTtsService.clear()
})

describe('intelligenceTtsService', () => {
  it('synthesizes speech through audio.tts and returns a playable data URL', async () => {
    invokeMock.mockResolvedValueOnce(createTtsResult())

    const result = await intelligenceTtsService.speak({
      text: 'Hello',
      language: 'en',
      sourceTraceId: 'trace-translation',
      metadata: { caller: 'plugin.translation' }
    })

    expect(invokeMock).toHaveBeenCalledWith(
      'audio.tts',
      expect.objectContaining({
        text: 'Hello',
        language: 'en',
        format: 'mp3'
      }),
      expect.objectContaining({
        metadata: expect.objectContaining({
          caller: 'plugin.translation',
          entry: 'tts-speak',
          sourceTraceId: 'trace-translation'
        })
      })
    )
    expect(result).toMatchObject({
      audio: 'data:audio/mpeg;base64,ZmFrZS1hdWRpbw==',
      format: 'mp3',
      provider: 'openai-default',
      model: 'tts-1',
      traceId: 'trace-tts',
      sourceTraceId: 'trace-translation',
      cacheHit: false
    })
  })

  it('reuses process-local cache for equivalent speech requests', async () => {
    invokeMock.mockResolvedValueOnce(createTtsResult())

    const first = await intelligenceTtsService.speak({ text: 'Cache me', language: 'en' })
    const second = await intelligenceTtsService.speak({ text: ' Cache me ', language: 'en' })

    expect(invokeMock).toHaveBeenCalledTimes(1)
    expect(first.cacheHit).toBe(false)
    expect(second.cacheHit).toBe(true)
    expect(second.audio).toBe(first.audio)
    expect(second.traceId).toBe(first.traceId)
  })
})
