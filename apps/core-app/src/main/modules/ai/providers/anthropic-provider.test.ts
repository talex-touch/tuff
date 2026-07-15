import { beforeEach, describe, expect, it, vi } from 'vitest'
import { IntelligenceProviderType } from '@talex-touch/tuff-intelligence'

const modelMocks = vi.hoisted(() => ({
  construct: vi.fn(),
  invoke: vi.fn()
}))

vi.mock('@langchain/anthropic', () => ({
  ChatAnthropic: class {
    constructor(config: unknown) {
      modelMocks.construct(config)
      return { invoke: modelMocks.invoke }
    }
  }
}))

import { AnthropicProvider } from './anthropic-provider'

function createProvider() {
  return new AnthropicProvider({
    id: 'anthropic-vision',
    type: IntelligenceProviderType.ANTHROPIC,
    name: 'Anthropic Vision',
    enabled: true,
    apiKey: 'test-api-key',
    baseUrl: 'https://anthropic.example.test/v1',
    defaultModel: 'claude-3-5-sonnet-20241022',
    models: ['claude-3-5-sonnet-20241022'],
    capabilities: ['image.caption', 'image.analyze'],
    priority: 1
  })
}

function expectAnthropicBase64ImageInvocation(call: number) {
  expect(modelMocks.invoke).toHaveBeenNthCalledWith(
    call,
    expect.arrayContaining([
      expect.objectContaining({
        content: expect.arrayContaining([
          expect.objectContaining({
            type: 'image',
            source_type: 'base64',
            mime_type: 'image/png',
            data: 'aW1hZ2U='
          })
        ])
      })
    ])
  )
}

describe('AnthropicProvider vision image capabilities', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('sends base64 images as Anthropic blocks and normalizes caption and analysis JSON', async () => {
    modelMocks.invoke
      .mockResolvedValueOnce({
        content: JSON.stringify({
          caption: 'A black cat sleeping on a yellow chair.',
          alternativeCaptions: ['A cat naps in a sunny chair.'],
          tags: ['cat', 'chair', 'sleeping'],
          confidence: 0.94
        })
      })
      .mockResolvedValueOnce({
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
        })
      })

    const provider = createProvider()
    const source = { type: 'base64' as const, base64: 'aW1hZ2U=' }

    const caption = await provider.imageCaption(
      { source, style: 'brief', language: 'en' },
      { metadata: { capabilityId: 'image.caption' } }
    )
    const analysis = await provider.imageAnalyze(
      {
        source,
        analysisTypes: ['objects', 'colors', 'scene', 'text'],
        language: 'en',
        detailed: true
      },
      { metadata: { capabilityId: 'image.analyze' } }
    )

    expect(modelMocks.invoke).toHaveBeenCalledTimes(2)
    expectAnthropicBase64ImageInvocation(1)
    expectAnthropicBase64ImageInvocation(2)
    expect(caption.result).toEqual({
      caption: 'A black cat sleeping on a yellow chair.',
      alternativeCaptions: ['A cat naps in a sunny chair.'],
      tags: ['cat', 'chair', 'sleeping'],
      confidence: 0.94
    })
    expect(analysis.result).toEqual({
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
    })
  })
})
