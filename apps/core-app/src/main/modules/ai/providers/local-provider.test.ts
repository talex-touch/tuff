import { describe, expect, it, vi } from 'vitest'
import type { IntelligenceVisionOcrPayload } from '@talex-touch/utils'
import { IntelligenceProviderType } from '@talex-touch/utils'

vi.mock('@talex-touch/tuff-native', () => ({
  getNativeOcrSupport: vi.fn(),
  recognizeImageText: vi.fn()
}))

import { getNativeOcrSupport, recognizeImageText } from '@talex-touch/tuff-native'
import { LocalProvider } from './local-provider'

const mockedGetNativeOcrSupport = vi.mocked(getNativeOcrSupport)
const mockedRecognizeImageText = vi.mocked(recognizeImageText)

function createProvider() {
  return new LocalProvider({
    id: 'local-system-ocr',
    type: IntelligenceProviderType.LOCAL,
    name: 'System OCR',
    enabled: true,
    priority: 0,
    models: ['system-ocr'],
    capabilities: ['vision.ocr'],
    timeout: 30000,
    rateLimit: {}
  })
}

describe('LocalProvider.visionOcr', () => {
  it('maps native OCR result into intelligence result', async () => {
    mockedGetNativeOcrSupport.mockReturnValue({
      supported: true,
      platform: 'darwin'
    })
    mockedRecognizeImageText.mockResolvedValue({
      text: 'Hello OCR',
      confidence: 0.88,
      language: 'en',
      blocks: [
        {
          text: 'Hello OCR',
          confidence: 0.88,
          boundingBox: [10, 20, 100, 40]
        }
      ],
      engine: 'apple-vision',
      durationMs: 42
    })

    const provider = createProvider()
    const payload: IntelligenceVisionOcrPayload = {
      source: {
        type: 'base64',
        base64: Buffer.from('fake-image').toString('base64')
      },
      includeLayout: true,
      includeKeywords: true,
      language: 'en'
    }

    const result = await provider.visionOcr(payload, {})

    expect(result.model).toBe('system-ocr')
    expect(result.provider).toBe(IntelligenceProviderType.LOCAL)
    expect(result.result.text).toBe('Hello OCR')
    expect(result.result.engine).toBe('apple-vision')
    expect(result.result.durationMs).toBe(42)
    expect(result.result.blocks?.[0]?.type).toBe('line')
    expect(result.result.keywords).toContain('hello')
    expect(mockedRecognizeImageText).toHaveBeenCalledOnce()
  })

  it('throws when native OCR is unavailable', async () => {
    mockedGetNativeOcrSupport.mockReturnValue({
      supported: false,
      platform: 'linux',
      reason: 'platform-not-supported'
    })

    const provider = createProvider()

    await expect(
      provider.visionOcr(
        {
          source: {
            type: 'base64',
            base64: Buffer.from('fake-image').toString('base64')
          }
        },
        {}
      )
    ).rejects.toThrow('Native OCR unavailable')
  })
})
