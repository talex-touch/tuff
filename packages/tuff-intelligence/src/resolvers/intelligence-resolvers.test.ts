import { describe, expect, it } from 'vitest'
import { IntelligenceProviderType } from '../types/intelligence'
import {
  normalizeIntelligencePayload,
  resolveFirstIntelligenceProviderRoute,
  resolveIntelligencePromptTemplate,
  toRegistryCapabilityId,
  toRuntimeCapabilityId,
  uniqueRegistryCapabilityIds,
} from './index'

const providers = [
  {
    id: 'openai-default',
    type: IntelligenceProviderType.OPENAI,
    name: 'OpenAI',
    enabled: true,
    hasApiKey: true,
    models: ['gpt-4o-mini', 'gpt-4o'],
    defaultModel: 'gpt-4o-mini',
    priority: 3,
  },
  {
    id: 'deepseek-default',
    type: IntelligenceProviderType.DEEPSEEK,
    name: 'DeepSeek',
    enabled: true,
    hasApiKey: true,
    models: ['deepseek-chat'],
    defaultModel: 'deepseek-chat',
    priority: 2,
  },
]

describe('intelligence shared resolvers', () => {
  it('normalizes runtime and registry capability aliases', () => {
    expect(toRuntimeCapabilityId('chat.completion')).toBe('text.chat')
    expect(toRuntimeCapabilityId('image-generate')).toBe('image.generate')
    expect(toRuntimeCapabilityId('images.edit')).toBe('image.edit')
    expect(toRuntimeCapabilityId('speech-to-text')).toBe('audio.transcribe')
    expect(toRegistryCapabilityId('text.chat')).toBe('chat.completion')
    expect(toRegistryCapabilityId('image.create')).toBe('image.generate')
    expect(uniqueRegistryCapabilityIds(['text.chat', 'chat.completion', 'text.summarize'])).toEqual([
      'chat.completion',
      'text.summarize',
    ])
  })

  it('resolves prompt template with CoreApp-compatible binding precedence', () => {
    const template = resolveIntelligencePromptTemplate({
      capabilityId: 'chat.completion',
      capability: {
        promptTemplate: 'fallback template',
        promptBinding: {
          capabilityId: 'text.chat',
          promptId: 'capability.text.chat.default',
          promptVersion: '1.0.0',
        },
      },
      metadataBinding: {
        capabilityId: 'text.chat',
        promptId: 'runtime.override',
      },
      promptBindings: [
        {
          capabilityId: 'text.chat',
          promptId: 'provider.override',
          providerId: 'openai-default',
        },
      ],
      promptRegistry: [
        {
          id: 'capability.text.chat.default',
          version: '1.0.0',
          template: 'capability template',
          scope: 'capability',
          status: 'active',
          capabilityId: 'text.chat',
          updatedAt: 10,
        },
        {
          id: 'runtime.override',
          version: '2.0.0',
          template: 'metadata template',
          scope: 'capability',
          status: 'active',
          capabilityId: 'text.chat',
          updatedAt: 20,
        },
        {
          id: 'provider.override',
          version: '1.0.0',
          template: 'provider template',
          scope: 'provider',
          status: 'active',
          capabilityId: 'text.chat',
          providerId: 'openai-default',
          updatedAt: 30,
        },
      ],
      providerId: 'openai-default',
    })

    expect(template).toBe('metadata template')
  })

  it('selects provider route from capability bindings, models and priority', () => {
    const route = resolveFirstIntelligenceProviderRoute({
      capabilityId: 'text.chat',
      providers,
      capability: {
        providers: [
          { providerId: 'openai-default', priority: 1, enabled: true, models: ['gpt-4o'] },
          { providerId: 'deepseek-default', priority: 2, enabled: true },
        ],
      },
      options: {
        modelPreference: ['gpt-4o'],
      },
    })

    expect(route).toMatchObject({
      provider: { id: 'openai-default' },
      model: 'gpt-4o',
      bindingModels: ['gpt-4o'],
    })
  })

  it('normalizes multimodal image payload shapes', () => {
    expect(normalizeIntelligencePayload('images.generate', {
      input: 'A tiny robot',
      size: '1024x768',
      n: 2,
      style_preset: 'cinematic',
    })).toEqual({
      capabilityId: 'image.generate',
      payload: {
        prompt: 'A tiny robot',
        width: 1024,
        height: 768,
        style: 'cinematic',
        count: 2,
      },
    })

    expect(normalizeIntelligencePayload('image.inpaint', {
      image: 'data:image/png;base64,abc',
      prompt: 'Remove watermark',
      operation: 'inpaint',
    })).toEqual({
      capabilityId: 'image.edit',
      payload: {
        source: { type: 'data-url', dataUrl: 'data:image/png;base64,abc' },
        mask: undefined,
        prompt: 'Remove watermark',
        editType: 'inpaint',
      },
    })
  })
})
