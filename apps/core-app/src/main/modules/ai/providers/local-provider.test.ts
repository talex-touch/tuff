import { describe, expect, it, vi } from 'vitest'
import type { IntelligenceVisionOcrPayload } from '@talex-touch/tuff-intelligence'
import { IntelligenceProviderType } from '@talex-touch/tuff-intelligence'

vi.mock('@talex-touch/tuff-native', () => ({
  getNativeOcrSupport: vi.fn(),
  recognizeImageText: vi.fn()
}))

import { getNativeOcrSupport, recognizeImageText } from '@talex-touch/tuff-native'
import { LocalProvider } from './local-provider'

const mockedGetNativeOcrSupport = vi.mocked(getNativeOcrSupport)
const mockedRecognizeImageText = vi.mocked(recognizeImageText)
const networkMocks = vi.hoisted(() => ({
  request: vi.fn()
}))

vi.mock('../../network', () => ({
  getNetworkService: () => networkMocks
}))

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

describe('LocalProvider.chat', () => {
  it('uses Ollama /api/chat through the unified network service', async () => {
    networkMocks.request.mockResolvedValueOnce({
      data: {
        model: 'llama3.1:8b',
        message: { content: 'pong' },
        prompt_eval_count: 3,
        eval_count: 2
      }
    })

    const provider = new LocalProvider({
      id: 'local-default',
      type: IntelligenceProviderType.LOCAL,
      name: 'Local Model',
      enabled: true,
      priority: 3,
      baseUrl: 'http://localhost:11434',
      defaultModel: 'llama3.1:8b',
      models: ['llama3.1:8b']
    })

    const result = await provider.chat(
      {
        messages: [{ role: 'user', content: 'ping' }],
        maxTokens: 12,
        temperature: 0.2
      },
      {}
    )

    expect(result.result).toBe('pong')
    expect(result.model).toBe('llama3.1:8b')
    expect(result.usage.totalTokens).toBe(5)
    expect(networkMocks.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        url: 'http://localhost:11434/api/chat',
        proxyOverride: { mode: 'direct' },
        body: expect.objectContaining({
          model: 'llama3.1:8b',
          stream: false
        })
      })
    )
  })
})
