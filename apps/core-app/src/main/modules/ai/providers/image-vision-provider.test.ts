import { beforeEach, describe, expect, it, vi } from 'vitest'
import { IntelligenceProviderType } from '@talex-touch/tuff-intelligence'

const modelMocks = vi.hoisted(() => ({
  construct: vi.fn(),
  invoke: vi.fn(),
  stream: vi.fn()
}))

const networkMocks = vi.hoisted(() => ({
  fetch: vi.fn()
}))

vi.mock('@langchain/openai', () => ({
  ChatOpenAI: class {
    constructor(config: unknown) {
      modelMocks.construct(config)
      return {
        invoke: modelMocks.invoke,
        stream: modelMocks.stream
      }
    }
  }
}))

vi.mock('../../network', () => ({
  getNetworkService: () => networkMocks
}))

import { OpenAIProvider } from './openai-provider'

function createProvider() {
  return new OpenAIProvider({
    id: 'openai-vision',
    type: IntelligenceProviderType.OPENAI,
    name: 'OpenAI Vision',
    enabled: true,
    apiKey: 'test-api-key',
    baseUrl: 'https://openai.example.test/v1',
    defaultModel: 'gpt-4o',
    models: ['gpt-4o'],
    capabilities: ['image.caption', 'image.analyze'],
    priority: 1
  })
}

function expectVisionImageInvocation(expectedUrl: string) {
  expect(modelMocks.invoke).toHaveBeenCalledOnce()
  expect(modelMocks.invoke).toHaveBeenCalledWith(
    expect.arrayContaining([
      expect.objectContaining({
        content: expect.arrayContaining([
          expect.objectContaining({
            type: 'image_url',
            image_url: { url: expectedUrl }
          })
        ])
      })
    ])
  )
}

describe('OpenAIProvider vision image capabilities', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('sends a base64 image to the vision model and returns the structured caption', async () => {
    modelMocks.invoke.mockResolvedValue({
      content: JSON.stringify({
        caption: 'A black cat sleeping on a yellow chair.',
        alternativeCaptions: ['A cat naps in a sunny chair.'],
        tags: ['cat', 'chair', 'sleeping'],
        confidence: 0.94
      }),
      usage_metadata: {
        input_tokens: 18,
        output_tokens: 12,
        total_tokens: 30
      },
      response_metadata: { model_name: 'gpt-4o' }
    })

    const result = await createProvider().imageCaption(
      {
        source: { type: 'base64', base64: 'aW1hZ2U=' },
        style: 'brief',
        language: 'en'
      },
      { metadata: { capabilityId: 'image.caption' } }
    )

    expectVisionImageInvocation('data:image/png;base64,aW1hZ2U=')
    expect(result).toMatchObject({
      result: {
        caption: 'A black cat sleeping on a yellow chair.',
        alternativeCaptions: ['A cat naps in a sunny chair.'],
        tags: ['cat', 'chair', 'sleeping'],
        confidence: 0.94
      },
      usage: { promptTokens: 18, completionTokens: 12, totalTokens: 30 },
      model: 'gpt-4o',
      provider: IntelligenceProviderType.OPENAI
    })
  })

  it('sends a data URL to the vision model and returns the structured image analysis', async () => {
    modelMocks.invoke.mockResolvedValue({
      content: JSON.stringify({
        description: 'A red bicycle is parked beside a brick wall.',
        objects: [
          {
            name: 'bicycle',
            confidence: 0.98,
            boundingBox: [24, 32, 480, 312]
          }
        ],
        colors: [{ color: 'red', percentage: 42, hex: '#D32F2F' }],
        scene: {
          type: 'outdoor street',
          confidence: 0.91,
          attributes: { lighting: 'daylight' }
        },
        text: ['BIKE LANE'],
        tags: ['bicycle', 'street', 'brick wall']
      }),
      response_metadata: { model_name: 'gpt-4o' }
    })

    const imageDataUrl = 'data:image/jpeg;base64,aW1hZ2U='
    const result = await createProvider().imageAnalyze(
      {
        source: { type: 'data-url', dataUrl: imageDataUrl },
        analysisTypes: ['objects', 'colors', 'scene', 'text'],
        language: 'en',
        detailed: true
      },
      { metadata: { capabilityId: 'image.analyze' } }
    )

    expectVisionImageInvocation(imageDataUrl)
    expect(result).toMatchObject({
      result: {
        description: 'A red bicycle is parked beside a brick wall.',
        objects: [
          {
            name: 'bicycle',
            confidence: 0.98,
            boundingBox: [24, 32, 480, 312]
          }
        ],
        colors: [{ color: 'red', percentage: 42, hex: '#D32F2F' }],
        scene: {
          type: 'outdoor street',
          confidence: 0.91,
          attributes: { lighting: 'daylight' }
        },
        text: ['BIKE LANE'],
        tags: ['bicycle', 'street', 'brick wall']
      },
      model: 'gpt-4o',
      provider: IntelligenceProviderType.OPENAI
    })
  })
})
