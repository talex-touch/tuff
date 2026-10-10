import {
  IntelligenceCapabilityType,
  IntelligenceProviderType
} from '@talex-touch/tuff-intelligence'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createChatProvider,
  FakeProviderManager,
  getStorageMocks
} from './intelligence-test-harness'
// The harness must register Vitest mocks before subject modules, so this import order is intentional.
import { intelligenceCapabilityRegistry } from './intelligence-capability-registry'
import { getProviderModelOptions } from './intelligence-provider-model-options'
import { setIntelligenceProviderManager } from './intelligence-sdk'
import { IntelligenceProvider } from './runtime/base-provider'

const storageMocks = getStorageMocks()

const piMocks = vi.hoisted(() => ({
  executable: undefined as string | null | undefined,
  patterns: [] as string[]
}))

// The subject reads pi's executable probe and catalogue files — both
// environmental. `isPiCliProviderConfig` stays real so the pi branch is
// selected exactly the way production selects it.
vi.mock('./providers/pi-cli-runtime', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./providers/pi-cli-runtime')>()),
  getResolvedPiExecutable: () => piMocks.executable
}))

vi.mock('./providers/pi-model-catalog', () => ({
  listPiCliModels: () => piMocks.patterns,
  listOmpCliModels: () => ['codex/gpt-5.6-luna'],
  listCodexCliModels: () => ['gpt-5.5'],
  listClaudeCliModels: () => ['claude-3-7-sonnet'],
  readPiCliModelCatalog: () => new Map(),
  readOmpCliModelCatalog: () => new Map()
}))

class ProviderModelOptionsManager extends FakeProviderManager {
  registerFromConfig() {
    return undefined as never
  }
}

class RuntimeProviderWithoutExtendedOverrides extends IntelligenceProvider {
  readonly type = IntelligenceProviderType.CUSTOM

  async chat(): Promise<never> {
    throw new Error('not used')
  }

  async *chatStream(): AsyncGenerator<never> {
    throw new Error('not used')
  }

  async embedding(): Promise<never> {
    throw new Error('not used')
  }

  async translate(): Promise<never> {
    throw new Error('not used')
  }
}

class RuntimeImageCaptionProvider extends RuntimeProviderWithoutExtendedOverrides {
  async imageCaption(): Promise<never> {
    throw new Error('not used')
  }
}

describe('coreApp intelligence provider model options', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    storageMocks.storedConfig = undefined
  })

  it('returns sanitized text.chat provider and model options', () => {
    intelligenceCapabilityRegistry.clear()
    intelligenceCapabilityRegistry.register({
      id: 'text.chat',
      type: IntelligenceCapabilityType.CHAT,
      name: 'Chat',
      description: 'test chat',
      supportedProviders: [
        IntelligenceProviderType.LOCAL,
        IntelligenceProviderType.OPENAI,
        IntelligenceProviderType.CUSTOM
      ]
    })
    storageMocks.storedConfig = {
      providers: [
        {
          id: 'local-chat',
          type: IntelligenceProviderType.LOCAL,
          name: 'Local Chat',
          enabled: true,
          capabilities: ['text.chat']
        },
        {
          id: 'openai-chat',
          type: IntelligenceProviderType.OPENAI,
          name: 'OpenAI',
          enabled: true,
          apiKey: 'sk-test',
          capabilities: ['text.chat']
        },
        {
          id: 'guest-chat',
          type: IntelligenceProviderType.CUSTOM,
          name: 'Guest Nexus',
          enabled: true,
          apiKey: 'guest',
          capabilities: ['text.chat'],
          metadata: { tokenMode: 'guest' }
        }
      ],
      globalConfig: {
        defaultStrategy: 'adaptive-default',
        enableAudit: true,
        enableCache: false
      },
      capabilities: {
        'text.chat': {
          id: 'text.chat',
          providers: [
            { providerId: 'local-chat', priority: 1, enabled: true },
            { providerId: 'openai-chat', priority: 2, enabled: true },
            { providerId: 'guest-chat', priority: 3, enabled: true }
          ]
        }
      },
      promptRegistry: [],
      promptBindings: [],
      version: 2
    }

    setIntelligenceProviderManager(
      new ProviderModelOptionsManager([
        createChatProvider(
          {
            id: 'local-chat',
            type: IntelligenceProviderType.LOCAL,
            name: 'Local Chat',
            defaultModel: 'llama3.1',
            models: [{ id: 'qwen2.5' }, { id: 'llama3.1' }],
            capabilities: ['text.chat']
          },
          vi.fn()
        ),
        createChatProvider(
          {
            id: 'openai-chat',
            type: IntelligenceProviderType.OPENAI,
            name: 'OpenAI',
            apiKey: 'sk-test',
            defaultModel: 'gpt-4.1-mini',
            models: [{ id: 'gpt-4.1' }, { id: 'gpt-4.1-mini' }],
            capabilities: ['text.chat'],
            metadata: { secretAlias: 'provider/openai' }
          },
          vi.fn()
        ),
        createChatProvider(
          {
            id: 'guest-chat',
            type: IntelligenceProviderType.CUSTOM,
            name: 'Guest Nexus',
            apiKey: 'guest',
            defaultModel: 'nexus-default',
            models: [{ id: 'nexus-default' }],
            capabilities: ['text.chat'],
            metadata: { tokenMode: 'guest' }
          },
          vi.fn()
        ),
        createChatProvider(
          {
            id: 'vision-only',
            type: IntelligenceProviderType.LOCAL,
            name: 'Vision Only',
            defaultModel: 'system-ocr',
            models: [{ id: 'system-ocr' }],
            capabilities: ['vision.ocr']
          },
          vi.fn()
        )
      ])
    )

    const options = getProviderModelOptions('text.chat')

    expect(options.map(({ effectiveModels: _effectiveModels, ...option }) => option)).toEqual([
      {
        providerId: 'local-chat',
        providerName: 'Local Chat',
        providerType: IntelligenceProviderType.LOCAL,
        models: ['llama3.1', 'qwen2.5'],
        defaultModel: 'llama3.1',
        capabilities: ['text.chat'],
        available: true
      },
      {
        providerId: 'openai-chat',
        providerName: 'OpenAI',
        providerType: IntelligenceProviderType.OPENAI,
        models: ['gpt-4.1-mini', 'gpt-4.1'],
        defaultModel: 'gpt-4.1-mini',
        capabilities: ['text.chat'],
        available: true
      },
      {
        providerId: 'guest-chat',
        providerName: 'Guest Nexus',
        providerType: IntelligenceProviderType.CUSTOM,
        models: ['nexus-default'],
        defaultModel: 'nexus-default',
        capabilities: ['text.chat'],
        available: false
      }
    ])
    expect(JSON.stringify(options)).not.toContain('sk-test')
    expect(JSON.stringify(options)).not.toContain('secretAlias')
    expect(options.map((option) => option.providerId)).not.toContain('vision-only')
  })

  it('omits configured image caption providers that inherit the unsupported base method', () => {
    intelligenceCapabilityRegistry.clear()
    intelligenceCapabilityRegistry.register({
      id: 'image.caption',
      type: IntelligenceCapabilityType.IMAGE_CAPTION,
      name: 'Image Captioning',
      description: 'test image captioning',
      supportedProviders: [IntelligenceProviderType.CUSTOM]
    })
    storageMocks.storedConfig = {
      providers: [
        {
          id: 'inherited-caption',
          type: IntelligenceProviderType.CUSTOM,
          name: 'Inherited Caption',
          enabled: true,
          apiKey: 'credentialed-api-key',
          defaultModel: 'inherited-caption-model',
          models: [{ id: 'inherited-caption-model' }],
          capabilities: ['image.caption']
        },
        {
          id: 'implemented-caption',
          type: IntelligenceProviderType.CUSTOM,
          name: 'Implemented Caption',
          enabled: true,
          apiKey: 'credentialed-api-key',
          defaultModel: 'implemented-caption-model',
          models: [{ id: 'implemented-caption-model' }],
          capabilities: ['image.caption']
        }
      ],
      globalConfig: {
        defaultStrategy: 'adaptive-default',
        enableAudit: true,
        enableCache: false
      },
      capabilities: {
        'image.caption': {
          id: 'image.caption',
          providers: [
            { providerId: 'inherited-caption', priority: 1, enabled: true },
            { providerId: 'implemented-caption', priority: 2, enabled: true }
          ]
        }
      },
      promptRegistry: [],
      promptBindings: [],
      version: 2
    }
    setIntelligenceProviderManager(
      new ProviderModelOptionsManager([
        new RuntimeProviderWithoutExtendedOverrides({
          id: 'inherited-caption',
          type: IntelligenceProviderType.CUSTOM,
          name: 'Inherited Caption',
          enabled: true,
          apiKey: 'credentialed-api-key',
          defaultModel: 'inherited-caption-model',
          models: [{ id: 'inherited-caption-model' }],
          capabilities: ['image.caption']
        }),
        new RuntimeImageCaptionProvider({
          id: 'implemented-caption',
          type: IntelligenceProviderType.CUSTOM,
          name: 'Implemented Caption',
          enabled: true,
          apiKey: 'credentialed-api-key',
          defaultModel: 'implemented-caption-model',
          models: [{ id: 'implemented-caption-model' }],
          capabilities: ['image.caption']
        })
      ])
    )

    expect(
      getProviderModelOptions('image.caption').map(
        ({ effectiveModels: _effectiveModels, ...option }) => option
      )
    ).toEqual([
      {
        providerId: 'implemented-caption',
        providerName: 'Implemented Caption',
        providerType: IntelligenceProviderType.CUSTOM,
        models: ['implemented-caption-model'],
        defaultModel: 'implemented-caption-model',
        capabilities: ['image.caption'],
        available: true
      }
    ])
  })

  it('lists embedding-only providers for inherited semantic search routing', () => {
    intelligenceCapabilityRegistry.clear()
    intelligenceCapabilityRegistry.register({
      id: 'search.semantic',
      type: IntelligenceCapabilityType.SEMANTIC_SEARCH,
      name: 'Semantic Search',
      description: 'test semantic embedding model options',
      supportedProviders: [IntelligenceProviderType.CUSTOM]
    })
    intelligenceCapabilityRegistry.register({
      id: 'embedding.generate',
      type: IntelligenceCapabilityType.EMBEDDING,
      name: 'Embedding',
      description: 'test embedding model routing',
      supportedProviders: [IntelligenceProviderType.CUSTOM]
    })
    storageMocks.storedConfig = {
      providers: [
        {
          id: 'semantic-embedding-provider',
          type: IntelligenceProviderType.CUSTOM,
          name: 'Semantic Embedding Provider',
          enabled: true,
          apiKey: 'semantic-embedding-key',
          defaultModel: 'generic-chat-model',
          models: ['generic-chat-model'],
          capabilities: ['embedding.generate']
        }
      ],
      globalConfig: {
        defaultStrategy: 'adaptive-default',
        enableAudit: true,
        enableCache: false
      },
      capabilities: {
        'search.semantic': {
          id: 'search.semantic',
          providers: [
            {
              providerId: 'semantic-embedding-provider',
              priority: 1,
              enabled: false,
              models: ['disabled-semantic-model']
            }
          ]
        },
        'embedding.generate': {
          id: 'embedding.generate',
          providers: [
            {
              providerId: 'semantic-embedding-provider',
              priority: 1,
              enabled: true,
              models: ['semantic-embedding-model']
            }
          ]
        }
      },
      promptRegistry: [],
      promptBindings: [],
      version: 2
    }
    setIntelligenceProviderManager(
      new ProviderModelOptionsManager([
        new RuntimeProviderWithoutExtendedOverrides({
          id: 'semantic-embedding-provider',
          type: IntelligenceProviderType.CUSTOM,
          name: 'Semantic Embedding Provider',
          enabled: true,
          apiKey: 'semantic-embedding-key',
          defaultModel: 'generic-chat-model',
          models: [{ id: 'generic-chat-model' }],
          capabilities: ['embedding.generate']
        })
      ])
    )

    expect(
      getProviderModelOptions('search.semantic').map(
        ({ effectiveModels: _effectiveModels, ...option }) => option
      )
    ).toEqual([
      {
        providerId: 'semantic-embedding-provider',
        providerName: 'Semantic Embedding Provider',
        providerType: IntelligenceProviderType.CUSTOM,
        models: ['semantic-embedding-model'],
        defaultModel: 'semantic-embedding-model',
        capabilities: ['embedding.generate'],
        available: true
      }
    ])
  })

  it('lists embedding-only providers for inherited rerank routing', () => {
    intelligenceCapabilityRegistry.clear()
    intelligenceCapabilityRegistry.register({
      id: 'search.rerank',
      type: IntelligenceCapabilityType.RERANK,
      name: 'Search Rerank',
      description: 'test embedding-backed rerank model options',
      supportedProviders: [IntelligenceProviderType.CUSTOM]
    })
    intelligenceCapabilityRegistry.register({
      id: 'embedding.generate',
      type: IntelligenceCapabilityType.EMBEDDING,
      name: 'Embedding',
      description: 'test embedding model routing',
      supportedProviders: [IntelligenceProviderType.CUSTOM]
    })
    storageMocks.storedConfig = {
      providers: [
        {
          id: 'rerank-embedding-provider',
          type: IntelligenceProviderType.CUSTOM,
          name: 'Rerank Embedding Provider',
          enabled: true,
          apiKey: 'rerank-embedding-key',
          defaultModel: 'generic-chat-model',
          models: ['generic-chat-model'],
          capabilities: ['embedding.generate']
        }
      ],
      globalConfig: {
        defaultStrategy: 'adaptive-default',
        enableAudit: true,
        enableCache: false
      },
      capabilities: {
        'search.rerank': {
          id: 'search.rerank',
          providers: [
            {
              providerId: 'rerank-embedding-provider',
              priority: 1,
              enabled: false,
              models: ['disabled-rerank-model']
            }
          ]
        },
        'embedding.generate': {
          id: 'embedding.generate',
          providers: [
            {
              providerId: 'rerank-embedding-provider',
              priority: 1,
              enabled: true,
              models: ['rerank-embedding-model']
            }
          ]
        }
      },
      promptRegistry: [],
      promptBindings: [],
      version: 2
    }
    setIntelligenceProviderManager(
      new ProviderModelOptionsManager([
        new RuntimeProviderWithoutExtendedOverrides({
          id: 'rerank-embedding-provider',
          type: IntelligenceProviderType.CUSTOM,
          name: 'Rerank Embedding Provider',
          enabled: true,
          apiKey: 'rerank-embedding-key',
          defaultModel: 'generic-chat-model',
          models: [{ id: 'generic-chat-model' }],
          capabilities: ['embedding.generate']
        })
      ])
    )

    expect(
      getProviderModelOptions('search.rerank').map(
        ({ effectiveModels: _effectiveModels, ...option }) => option
      )
    ).toEqual([
      {
        providerId: 'rerank-embedding-provider',
        providerName: 'Rerank Embedding Provider',
        providerType: IntelligenceProviderType.CUSTOM,
        models: ['rerank-embedding-model'],
        defaultModel: 'rerank-embedding-model',
        capabilities: ['embedding.generate'],
        available: true
      }
    ])
  })
})

describe('pi provider model sourcing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    piMocks.executable = '/usr/local/bin/pi'
    piMocks.patterns = ['anthropic/claude-x', 'Custom/model-a']

    intelligenceCapabilityRegistry.clear()
    intelligenceCapabilityRegistry.register({
      id: 'text.chat',
      type: IntelligenceCapabilityType.CHAT,
      name: 'Chat',
      description: 'test chat',
      supportedProviders: [IntelligenceProviderType.LOCAL, IntelligenceProviderType.OPENAI]
    })
    storageMocks.storedConfig = {
      providers: [
        {
          id: 'pi-cli-default',
          type: IntelligenceProviderType.LOCAL,
          name: 'Pi (local CLI)',
          enabled: true,
          capabilities: ['text.chat'],
          metadata: { internal: true, origin: 'pi-cli' }
        },
        {
          id: 'openai-chat',
          type: IntelligenceProviderType.OPENAI,
          name: 'OpenAI',
          enabled: true,
          apiKey: 'sk-test',
          capabilities: ['text.chat']
        }
      ],
      globalConfig: {
        defaultStrategy: 'adaptive-default',
        enableAudit: true,
        enableCache: false
      },
      capabilities: {
        'text.chat': {
          id: 'text.chat',
          providers: [
            { providerId: 'pi-cli-default', priority: 1, enabled: true },
            { providerId: 'openai-chat', priority: 2, enabled: true }
          ]
        }
      },
      promptRegistry: [],
      promptBindings: [],
      version: 2
    }
    setIntelligenceProviderManager(
      new ProviderModelOptionsManager([
        createChatProvider(
          {
            id: 'pi-cli-default',
            type: IntelligenceProviderType.LOCAL,
            name: 'Pi (local CLI)',
            capabilities: ['text.chat'],
            metadata: { internal: true, origin: 'pi-cli' }
          },
          vi.fn()
        ),
        createChatProvider(
          {
            id: 'openai-chat',
            type: IntelligenceProviderType.OPENAI,
            name: 'OpenAI',
            apiKey: 'sk-test',
            defaultModel: 'gpt-4.1-mini',
            models: [{ id: 'gpt-4.1-mini' }],
            capabilities: ['text.chat']
          },
          vi.fn()
        )
      ])
    )
  })

  it('fills the pi row from the CLI catalogue', () => {
    const pi = getProviderModelOptions('text.chat').find(
      (option) => option.providerId === 'pi-cli-default'
    )

    expect(pi).toMatchObject({
      models: ['anthropic/claude-x', 'Custom/model-a'],
      available: true
    })
  })

  it('drops the pi row on a machine probed to have no CLI, keeping the rest', () => {
    piMocks.executable = null

    const options = getProviderModelOptions('text.chat')

    expect(options.some((option) => option.providerId === 'pi-cli-default')).toBe(false)
    expect(options.some((option) => option.providerId === 'openai-chat')).toBe(true)
  })

  it('keeps the pi row while the probe has not settled yet', () => {
    // Unprobed is not absent: config assembly documents the same distinction.
    piMocks.executable = undefined

    const pi = getProviderModelOptions('text.chat').find(
      (option) => option.providerId === 'pi-cli-default'
    )

    expect(pi?.models).toEqual(['anthropic/claude-x', 'Custom/model-a'])
  })

  it('lists nothing for pi when its catalogue is empty', () => {
    piMocks.patterns = []

    expect(
      getProviderModelOptions('text.chat').some((option) => option.providerId === 'pi-cli-default')
    ).toBe(false)
  })

  it('keeps an enabled pi the stored routing never bound, beside a bound provider', () => {
    // Config assembly binds a found CLI to `text.chat` in the runtime config only, so a real
    // profile's stored routing lists the user's other providers and nothing for pi.
    chatBindings().providers = [{ providerId: 'openai-chat', priority: 1, enabled: true }]

    const pi = getProviderModelOptions('text.chat').find(
      (option) => option.providerId === 'pi-cli-default'
    )

    expect(pi).toMatchObject({
      models: ['anthropic/claude-x', 'Custom/model-a'],
      available: true
    })
  })

  it('leaves pi out once the stored routing turned its binding off', () => {
    chatBindings().providers = [
      { providerId: 'pi-cli-default', priority: 1, enabled: false },
      { providerId: 'openai-chat', priority: 2, enabled: true }
    ]

    const options = getProviderModelOptions('text.chat')

    expect(options.some((option) => option.providerId === 'pi-cli-default')).toBe(false)
    expect(options.some((option) => option.providerId === 'openai-chat')).toBe(true)
  })
})

function chatBindings(): { providers: unknown[] } {
  const stored = storageMocks.storedConfig as {
    capabilities: Record<string, { providers: unknown[] }>
  }
  return stored.capabilities['text.chat']
}
