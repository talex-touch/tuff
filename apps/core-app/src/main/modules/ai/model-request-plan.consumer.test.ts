import type {
  IntelligenceChatPayload,
  IntelligenceModelBinding,
  IntelligenceProviderConfig
} from '@talex-touch/tuff-intelligence'
import type { IntelligenceModelCatalogEntry } from '@talex-touch/utils/intelligence/model-binding'
import { IntelligenceProviderType } from '@talex-touch/tuff-intelligence'
import { resolveEffectiveModel } from '@talex-touch/utils/intelligence/model-binding'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as catalog from './providers/pi-model-catalog'
import { planChatModelRequest, readModelPlan } from './model-request-plan'

// No existing model fixtures are changed. Public binding resolution takes an explicit catalog;
// the request gate uses a restored spy only at the host-owned catalog/file boundary.
afterEach(() => vi.restoreAllMocks())
function provider(
  binding: IntelligenceModelBinding,
  type = IntelligenceProviderType.OPENAI,
  id = 'api-fixture'
): IntelligenceProviderConfig {
  return { id, name: 'fixture', type, enabled: true, models: [binding] }
}
const image: IntelligenceChatPayload = {
  messages: [
    {
      role: 'user',
      content: 'Describe the picture.',
      attachments: [{ type: 'image', dataUrl: 'data:image/png;base64,aGVsbG8=' }]
    }
  ]
}

describe('model binding provenance and public request gates', () => {
  it.each([
    { source: 'catalog' as const, expectedWindow: 24000, expectedCap: 7000 },
    { source: 'user' as const, expectedWindow: 12000, expectedCap: 3000 }
  ])(
    '$source limits follow their actual provenance when a catalog refresh changes both limits',
    ({ source, expectedWindow, expectedCap }) => {
      const config = provider({
        id: 'model-a',
        contextWindow: 12000,
        contextWindowSource: source,
        maxTokens: 3000,
        maxTokensSource: source
      })
      const oldCatalog: IntelligenceModelCatalogEntry = { contextWindow: 12000, maxTokens: 3000 }
      const newCatalog: IntelligenceModelCatalogEntry = { contextWindow: 24000, maxTokens: 7000 }
      const before = resolveEffectiveModel(config, 'model-a', oldCatalog)
      const refreshed = resolveEffectiveModel(config, 'model-a', newCatalog)
      expect(before.contextWindow.value).toBe(12000)
      expect(refreshed.contextWindow).toEqual({ value: expectedWindow, source })
      expect(refreshed.maxOutputTokens).toMatchObject({ value: expectedCap, source })
    }
  )

  it.each([
    {
      name: 'API unknown modality',
      type: IntelligenceProviderType.OPENAI,
      id: 'api-fixture',
      binding: { id: 'model-a' },
      published: null,
      accepted: false
    },
    {
      name: 'API text-only catalog',
      type: IntelligenceProviderType.OPENAI,
      id: 'api-fixture',
      binding: { id: 'model-a' },
      published: { input: ['text'] },
      accepted: false
    },
    {
      name: 'API explicit image support',
      type: IntelligenceProviderType.OPENAI,
      id: 'api-fixture',
      binding: { id: 'model-a', supportsImages: true },
      published: { input: ['text'] },
      accepted: true
    },
    {
      name: 'API explicit rejection beats image catalog',
      type: IntelligenceProviderType.OPENAI,
      id: 'api-fixture',
      binding: { id: 'model-a', supportsImages: false },
      published: { input: ['text', 'image'] },
      accepted: false
    },
    {
      name: 'Ollama cannot transport an image override',
      type: IntelligenceProviderType.LOCAL,
      id: 'ollama-fixture',
      binding: { id: 'model-a', supportsImages: true },
      published: { input: ['image'] },
      accepted: false
    },
    {
      name: 'Claude CLI cannot transport an image override',
      type: IntelligenceProviderType.LOCAL,
      id: 'claude-cli',
      binding: { id: 'model-a', supportsImages: true },
      published: { input: ['image'] },
      accepted: false
    }
  ])(
    '$name does not claim acceptance the real adapter cannot provide',
    ({ type, id, binding, published, accepted }) => {
      const config = provider(binding, type, id)
      const effective = resolveEffectiveModel(config, 'model-a', published)
      expect(effective.imageInput.accepted).toBe(accepted)
      // API entries are unknown in Main without a CLI catalog; explicit overrides still drive its
      // actual input gate. Never test a copied/forwarded catalog value as though a request was sent.
      if (accepted)
        expect(
          planChatModelRequest(image, { modelPreference: ['model-a'] }, config).payload.messages[0]!
            .attachments
        ).toEqual(image.messages[0]!.attachments)
      else
        expect(() => planChatModelRequest(image, { modelPreference: ['model-a'] }, config)).toThrow(
          expect.objectContaining({
            code: 'MODEL_UNSUPPORTED',
            reason: 'MODEL_IMAGE_INPUT_UNSUPPORTED'
          })
        )
    }
  )

  it('a host-read CLI text-only catalog rejects images despite the CLI self-check route', () => {
    const config = provider(
      { id: 'custom/model-a' },
      IntelligenceProviderType.LOCAL,
      'pi-cli-default'
    )
    vi.spyOn(catalog, 'readPiCliModelCatalog').mockReturnValue(
      new Map([['custom/model-a', { input: ['text'] }]])
    )
    expect(() =>
      planChatModelRequest(image, { modelPreference: ['custom/model-a'] }, config)
    ).toThrow(
      expect.objectContaining({
        code: 'MODEL_UNSUPPORTED',
        reason: 'MODEL_IMAGE_INPUT_UNSUPPORTED'
      })
    )
  })

  it('image acceptance follows the freshly read CLI catalog, not an earlier model plan', () => {
    const config = provider(
      { id: 'custom/model-a' },
      IntelligenceProviderType.LOCAL,
      'pi-cli-default'
    )
    const listing = vi
      .spyOn(catalog, 'readPiCliModelCatalog')
      .mockReturnValue(new Map([['custom/model-a', { input: ['text', 'image'] }]]))
    const planned = planChatModelRequest(image, { modelPreference: ['custom/model-a'] }, config)
    expect(readModelPlan(planned.options)!.imageInput.accepted).toBe(true)
    expect(planned.payload.messages[0]!.attachments).toEqual(image.messages[0]!.attachments)
    listing.mockReturnValue(new Map([['custom/model-a', { input: ['text'] }]]))
    expect(() => planChatModelRequest(image, planned.options, config)).toThrow(
      expect.objectContaining({
        code: 'MODEL_UNSUPPORTED',
        reason: 'MODEL_IMAGE_INPUT_UNSUPPORTED'
      })
    )
  })

  it('the exact pinned context window is admitted; one estimated token past it is refused before a request', () => {
    const config = provider({ id: 'model-a', contextWindow: 3, contextWindowSource: 'user' })
    const admitted = planChatModelRequest(
      { messages: [{ role: 'user', content: '中文文' }] },
      { modelPreference: ['model-a'] },
      config
    )
    expect(admitted.payload.messages[0]!.content).toBe('中文文')
    expect(() =>
      planChatModelRequest(
        { messages: [{ role: 'user', content: '中文文字' }] },
        { modelPreference: ['model-a'] },
        config
      )
    ).toThrow(
      expect.objectContaining({
        code: 'MODEL_UNSUPPORTED',
        reason: 'MODEL_CONTEXT_WINDOW_EXCEEDED'
      })
    )
  })
})
