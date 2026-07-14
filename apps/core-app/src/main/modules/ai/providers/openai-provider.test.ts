import { beforeEach, describe, expect, it, vi } from 'vitest'
import { IntelligenceProviderType } from '@talex-touch/tuff-intelligence'

const networkMocks = vi.hoisted(() => ({
  request: vi.fn()
}))

vi.mock('../../network', () => ({
  getNetworkService: () => networkMocks
}))

import { OpenAIProvider } from './openai-provider'
import { SiliconflowProvider } from './siliconflow-provider'

interface ProviderRequest {
  method?: string
  url?: string
  headers?: Record<string, string>
  body?: unknown
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function isProviderRequest(value: unknown): value is ProviderRequest {
  return isRecord(value)
}

function createProvider() {
  return new OpenAIProvider({
    id: 'openai-multimodal',
    type: IntelligenceProviderType.OPENAI,
    name: 'OpenAI Multimodal',
    enabled: true,
    apiKey: 'test-api-key',
    baseUrl: 'https://openai.example.test/v1',
    defaultModel: 'whisper-1',
    models: ['whisper-1', 'gpt-4o-transcribe', 'gpt-image-1', 'gpt-image-edit-test'],
    capabilities: ['audio.stt', 'audio.transcribe', 'image.generate', 'image.edit'],
    priority: 1
  })
}

function createSiliconflowProvider() {
  return new SiliconflowProvider({
    id: 'siliconflow-audio',
    type: IntelligenceProviderType.SILICONFLOW,
    name: 'SiliconFlow Audio',
    enabled: true,
    apiKey: 'siliconflow-api-key',
    baseUrl: 'https://siliconflow.example.test/v1',
    defaultModel: 'deepseek-ai/DeepSeek-R1-0528-Qwen3-8B',
    models: ['deepseek-ai/DeepSeek-R1-0528-Qwen3-8B'],
    capabilities: ['audio.tts'],
    priority: 1
  })
}

function getProviderRequest() {
  expect(networkMocks.request).toHaveBeenCalledOnce()
  const request = networkMocks.request.mock.calls[0]?.[0]
  if (!isProviderRequest(request)) {
    throw new Error('Expected provider network request')
  }
  return request
}

function getAudioRequest() {
  const request = getProviderRequest()
  if (!(request.body instanceof FormData)) {
    throw new Error('Expected audio request body to be FormData')
  }
  return request
}

function expectJsonBody(value: unknown) {
  if (!isRecord(value)) {
    throw new Error('Expected request body to be a JSON object')
  }
  return value
}

function expectFormDataBody(value: unknown) {
  if (!(value instanceof FormData)) {
    throw new Error('Expected request body to be FormData')
  }
  return value
}

function expectBlobPart(
  body: FormData,
  key: string,
  expectedType: string,
  expectedNamePattern: RegExp
) {
  const file = body.get(key)
  expect(file).toBeInstanceOf(Blob)
  if (!(file instanceof Blob)) {
    throw new Error(`Expected ${key} to be a Blob`)
  }
  expect(file.type).toBe(expectedType)

  if ('name' in file && typeof file.name === 'string') {
    expect(file.name).toMatch(expectedNamePattern)
  }
}

function expectAudioFile(body: FormData, expectedType: string) {
  expectBlobPart(body, 'file', expectedType, /\.wav$/)
}

describe('OpenAIProvider audio transcription capabilities', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('posts an audio data URL to /audio/transcriptions and normalizes STT output', async () => {
    networkMocks.request.mockResolvedValueOnce({
      data: {
        text: 'launch sequence',
        confidence: 0.91,
        language: 'en',
        segments: [
          {
            text: 'launch sequence',
            start: 0,
            end: 1.8,
            confidence: 0.91
          }
        ]
      }
    })

    const result = await createProvider().stt(
      {
        audio: 'data:audio/wav;base64,ZmFrZS13YXY=',
        language: 'en',
        enableTimestamps: true
      },
      { metadata: { capabilityId: 'audio.stt' } }
    )

    const request = getAudioRequest()
    expect(request).toMatchObject({
      method: 'POST',
      url: 'https://openai.example.test/v1/audio/transcriptions',
      headers: {
        Authorization: 'Bearer test-api-key'
      }
    })
    expect(request.headers?.['Content-Type']).toBeUndefined()

    const body = request.body as FormData
    expect(body.get('model')).toBe('whisper-1')
    expect(body.get('language')).toBe('en')
    expect(body.get('response_format')).toBe('verbose_json')
    expect(body.get('timestamp_granularities[]')).toBe('segment')
    expectAudioFile(body, 'audio/wav')

    expect(result).toMatchObject({
      result: {
        text: 'launch sequence',
        confidence: 0.91,
        language: 'en',
        segments: [
          {
            text: 'launch sequence',
            start: 0,
            end: 1.8,
            confidence: 0.91
          }
        ]
      },
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      model: 'whisper-1',
      provider: IntelligenceProviderType.OPENAI
    })
  })

  it('maps translate transcription tasks to /audio/translations and preserves verbose timestamp segments', async () => {
    networkMocks.request.mockResolvedValueOnce({
      data: {
        text: 'hello world',
        language: 'fr',
        duration: 4.2,
        segments: [
          {
            id: 0,
            text: 'bonjour',
            start: 0,
            end: 2.1,
            confidence: 0.96
          },
          {
            id: 1,
            text: 'le monde',
            start: 2.1,
            end: 4.2,
            confidence: 0.93
          }
        ]
      }
    })

    const result = await createProvider().audioTranscribe(
      {
        audio: 'data:audio/wav;base64,ZmFrZS13YXY=',
        language: 'fr',
        task: 'translate',
        enableTimestamps: true,
        prompt: 'Product launch vocabulary'
      },
      { metadata: { capabilityId: 'audio.transcribe' }, modelPreference: ['whisper-1'] }
    )

    const request = getAudioRequest()
    expect(request).toMatchObject({
      method: 'POST',
      url: 'https://openai.example.test/v1/audio/translations',
      headers: {
        Authorization: 'Bearer test-api-key'
      }
    })
    expect(request.headers?.['Content-Type']).toBeUndefined()

    const body = request.body as FormData
    expect(body.get('model')).toBe('whisper-1')
    expect(body.get('language')).toBe('fr')
    expect(body.get('prompt')).toBe('Product launch vocabulary')
    expect(body.get('response_format')).toBe('verbose_json')
    expect(body.get('timestamp_granularities[]')).toBe('segment')
    expectAudioFile(body, 'audio/wav')

    expect(result).toMatchObject({
      result: {
        text: 'hello world',
        language: 'fr',
        duration: 4.2,
        segments: [
          {
            id: 0,
            text: 'bonjour',
            start: 0,
            end: 2.1,
            confidence: 0.96
          },
          {
            id: 1,
            text: 'le monde',
            start: 2.1,
            end: 4.2,
            confidence: 0.93
          }
        ]
      },
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      model: 'whisper-1',
      provider: IntelligenceProviderType.OPENAI
    })
  })

  it.each([
    {
      name: 'missing STT audio',
      invoke: (provider: OpenAIProvider) =>
        provider.stt({} as Parameters<OpenAIProvider['stt']>[0], {
          metadata: { capabilityId: 'audio.stt' }
        })
    },
    {
      name: 'blank audio transcription data URL',
      invoke: (provider: OpenAIProvider) =>
        provider.audioTranscribe(
          { audio: 'data:audio/wav;base64,   ' },
          { metadata: { capabilityId: 'audio.transcribe' } }
        )
    }
  ])('rejects $name before issuing a network request', async ({ invoke }) => {
    await expect(invoke(createProvider())).rejects.toThrow(/audio.*required|invalid audio/i)
    expect(networkMocks.request).not.toHaveBeenCalled()
  })
})

describe('OpenAI-compatible TTS capabilities', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('uses OpenAI HD speech model for HD TTS requests', async () => {
    networkMocks.request.mockResolvedValueOnce({
      data: Uint8Array.from([1, 2, 3]).buffer
    })

    const result = await createProvider().tts(
      {
        text: 'Read the launch checklist',
        quality: 'hd'
      },
      { metadata: { capabilityId: 'audio.tts' } }
    )

    const request = getProviderRequest()
    expect(request).toMatchObject({
      method: 'POST',
      url: 'https://openai.example.test/v1/audio/speech',
      headers: {
        Authorization: 'Bearer test-api-key',
        'Content-Type': 'application/json'
      }
    })
    const body = expectJsonBody(request.body)
    expect(body.model).toBe('tts-1-hd')
    expect(body.input).toBe('Read the launch checklist')
    expect(body.voice).toBe('alloy')
    expect(result.model).toBe('tts-1-hd')
  })

  it('uses SiliconFlow speech model and voice for HD TTS requests without payload voice', async () => {
    networkMocks.request.mockResolvedValueOnce({
      data: Uint8Array.from([4, 5, 6]).buffer
    })

    const result = await createSiliconflowProvider().tts(
      {
        text: 'Read the launch checklist',
        quality: 'hd'
      },
      { metadata: { capabilityId: 'audio.tts' } }
    )

    const request = getProviderRequest()
    expect(request).toMatchObject({
      method: 'POST',
      url: 'https://siliconflow.example.test/v1/audio/speech',
      headers: {
        Authorization: 'Bearer siliconflow-api-key',
        'Content-Type': 'application/json'
      }
    })
    const body = expectJsonBody(request.body)
    expect(body.model).toBe('fnlp/MOSS-TTSD-v0.5')
    expect(body.input).toBe('Read the launch checklist')
    expect(body.voice).toBe('fnlp/MOSS-TTSD-v0.5:alex')
    expect(result.model).toBe('fnlp/MOSS-TTSD-v0.5')
    expect(result.provider).toBe(IntelligenceProviderType.SILICONFLOW)
  })
})

describe('OpenAIProvider image generation and edit capabilities', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('posts JSON to /images/generations and normalizes base64 and URL image outputs', async () => {
    networkMocks.request.mockResolvedValueOnce({
      data: {
        data: [
          {
            b64_json: 'Zm94LWltYWdl',
            revised_prompt: 'A ceramic fox in morning light'
          },
          {
            url: 'https://cdn.example.test/generated-fox.png',
            revised_prompt: 'A second ceramic fox composition'
          }
        ]
      }
    })

    const result = await createProvider().imageGenerate(
      {
        prompt: 'Draw a ceramic fox in morning light',
        count: 2,
        width: 1024,
        height: 1024,
        quality: 'hd'
      },
      { metadata: { capabilityId: 'image.generate' } }
    )

    const request = getProviderRequest()
    expect(request).toMatchObject({
      method: 'POST',
      url: 'https://openai.example.test/v1/images/generations',
      headers: {
        Authorization: 'Bearer test-api-key',
        'Content-Type': 'application/json'
      }
    })

    const body = expectJsonBody(request.body)
    expect(body.model).toBe('gpt-image-1')
    expect(body.prompt).toBe('Draw a ceramic fox in morning light')
    expect(body.n).toBe(2)
    expect(body.size).toBe('1024x1024')
    expect(body.quality).toBe('hd')

    expect(result).toMatchObject({
      result: {
        images: [
          {
            base64: 'Zm94LWltYWdl',
            revisedPrompt: 'A ceramic fox in morning light'
          },
          {
            url: 'https://cdn.example.test/generated-fox.png',
            revisedPrompt: 'A second ceramic fox composition'
          }
        ]
      },
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      model: 'gpt-image-1',
      provider: IntelligenceProviderType.OPENAI
    })
  })

  it('posts source and mask data URLs as multipart FormData to /images/edits', async () => {
    networkMocks.request.mockResolvedValueOnce({
      data: {
        data: [
          {
            b64_json: 'ZWRpdGVkLWltYWdl',
            revised_prompt: 'Replace the mug with a glass cup'
          }
        ]
      }
    })

    const result = await createProvider().imageEdit(
      {
        source: { type: 'data-url', dataUrl: 'data:image/png;base64,c291cmNlLWltYWdl' },
        mask: { type: 'data-url', dataUrl: 'data:image/png;base64,bWFzay1pbWFnZQ==' },
        prompt: 'Replace the mug with a glass cup'
      },
      { metadata: { capabilityId: 'image.edit' }, modelPreference: ['gpt-image-edit-test'] }
    )

    const request = getProviderRequest()
    expect(request).toMatchObject({
      method: 'POST',
      url: 'https://openai.example.test/v1/images/edits',
      headers: {
        Authorization: 'Bearer test-api-key'
      }
    })
    expect(request.headers?.['Content-Type']).toBeUndefined()

    const body = expectFormDataBody(request.body)
    expect(body.get('model')).toBe('gpt-image-edit-test')
    expect(body.get('prompt')).toBe('Replace the mug with a glass cup')
    expectBlobPart(body, 'image', 'image/png', /\.png$/)
    expectBlobPart(body, 'mask', 'image/png', /\.png$/)

    expect(result).toMatchObject({
      result: {
        image: {
          base64: 'ZWRpdGVkLWltYWdl'
        },
        revisedPrompt: 'Replace the mug with a glass cup'
      },
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      model: 'gpt-image-edit-test',
      provider: IntelligenceProviderType.OPENAI
    })
  })

  it.each([
    {
      name: 'blank image generation prompt',
      invoke: (provider: OpenAIProvider) =>
        provider.imageGenerate({ prompt: '   ' }, { metadata: { capabilityId: 'image.generate' } })
    },
    {
      name: 'blank image edit prompt',
      invoke: (provider: OpenAIProvider) =>
        provider.imageEdit(
          {
            source: { type: 'data-url', dataUrl: 'data:image/png;base64,c291cmNlLWltYWdl' },
            prompt: '   '
          },
          { metadata: { capabilityId: 'image.edit' } }
        )
    }
  ])('rejects $name before issuing a network request', async ({ invoke }) => {
    await expect(invoke(createProvider())).rejects.toThrow(/prompt.*required/i)
    expect(networkMocks.request).not.toHaveBeenCalled()
  })
})
