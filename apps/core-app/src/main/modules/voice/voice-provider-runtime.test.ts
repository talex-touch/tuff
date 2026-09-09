import { beforeEach, describe, expect, it, vi } from 'vitest'

const runtime = vi.hoisted(() => ({
  bindings: {} as Record<string, Array<Record<string, unknown>>>,
  providers: {} as Record<string, { getConfig: () => Record<string, unknown> }>,
  credentials: {} as Record<string, string>,
  ensureLoaded: vi.fn(),
  supportsCapability: vi.fn()
}))
const adapterOptions = vi.hoisted(() => ({
  bailian: [] as Array<Record<string, unknown>>,
  qwen: [] as Array<Record<string, unknown>>,
  doubao: [] as Array<Record<string, unknown>>
}))

vi.mock('../ai/intelligence-config', () => ({
  ensureIntelligenceConfigLoaded: runtime.ensureLoaded,
  getEffectiveCapabilityRoutingConfig: (capabilityId: string) => ({
    providers: runtime.bindings[capabilityId] ?? []
  }),
  getCapabilityOptions: (capabilityId: string) => ({
    allowedProviderIds: (runtime.bindings[capabilityId] ?? []).map((binding) => binding.providerId)
  })
}))
vi.mock('../ai/intelligence-sdk', () => ({
  getIntelligenceProviderManager: () => ({
    get: (providerId: string) => runtime.providers[providerId]
  }),
  providerSupportsCapability: runtime.supportsCapability
}))
vi.mock('../ai/provider-credential-runtime', () => ({
  resolveProviderCredential: (provider: { id: string }) => runtime.credentials[provider.id]
}))
vi.mock('@talex-touch/tuff-voice', () => ({
  createFetchHttpClient: vi.fn(() => ({ request: vi.fn() })),
  createNodeVoiceSocketFactory: vi.fn(() => ({ connect: vi.fn() })),
  BailianParaformerVoiceProvider: class {
    readonly id = 'bailian-paraformer'
    readonly capabilities = { stream: true, upload: true, formats: [] }

    constructor(options: Record<string, unknown>) {
      adapterOptions.bailian.push(options)
    }
  },
  DashscopeQwenAsrRealtimeVoiceProvider: class {
    readonly id = 'dashscope-qwen-asr-realtime'
    readonly capabilities = { stream: true, upload: false, formats: [] }

    constructor(options: Record<string, unknown>) {
      adapterOptions.qwen.push(options)
    }
  },
  DoubaoVoiceProvider: class {
    readonly id = 'doubao'
    readonly capabilities = { stream: true, upload: true, formats: [] }

    constructor(options: Record<string, unknown>) {
      adapterOptions.doubao.push(options)
    }
  }
}))

import { getConfiguredAsrProvider, getRecognitionStatus } from './voice-provider-runtime'

function channel(
  id: string,
  options: {
    capabilities?: string[]
    models?: string[]
    defaultModel?: string
    baseUrl?: string
    metadata?: Record<string, unknown>
  } = {}
) {
  const config = {
    id,
    type: 'custom',
    name: id,
    enabled: true,
    baseUrl: options.baseUrl,
    capabilities: options.capabilities ?? ['audio.asr'],
    models: options.models ?? [],
    defaultModel: options.defaultModel,
    metadata: options.metadata
  }
  return { getConfig: () => config }
}

function configure(
  providers: Record<string, { getConfig: () => Record<string, unknown> }>,
  bindings: Record<string, Array<Record<string, unknown>>>,
  credentials: Record<string, string> = {}
): void {
  runtime.providers = providers
  runtime.bindings = bindings
  runtime.credentials = credentials
}

const BAILIAN_WORKSPACE_BASE_URL =
  'https://workspace-1.cn-beijing.maas.aliyuncs.com/compatible-mode/v1'
const BAILIAN_PUBLIC_BASE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1'

describe('capability-bound voice ASR provider resolution', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    runtime.bindings = {}
    runtime.providers = {}
    runtime.credentials = {}
    adapterOptions.bailian = []
    adapterOptions.qwen = []
    adapterOptions.doubao = []
    runtime.supportsCapability.mockImplementation(
      (provider: { getConfig: () => { capabilities?: string[] } }, capabilityId: string) =>
        provider.getConfig().capabilities?.includes(capabilityId) ?? false
    )
  })

  it('constructs Bailian from the capability-bound custom channel Base URL and secure credential', () => {
    configure(
      {
        bailian: channel('bailian', {
          baseUrl: BAILIAN_WORKSPACE_BASE_URL,
          models: ['paraformer-realtime-v2'],
          metadata: { voiceAsr: { protocol: 'bailian-paraformer' } }
        })
      },
      { 'audio.asr': [{ providerId: 'bailian', priority: 1, models: ['paraformer-realtime-v2'] }] },
      { bailian: 'secure-bailian-credential' }
    )

    const configured = getConfiguredAsrProvider()

    expect(configured.model).toBe('paraformer-realtime-v2')
    expect(configured.provider.id).toBe('bailian-paraformer')
    expect(adapterOptions.bailian).toEqual([
      expect.objectContaining({
        credentials: { apiKey: 'secure-bailian-credential', workspaceId: 'workspace-1' },
        streamOptions: { model: 'paraformer-realtime-v2' }
      })
    ])
  })

  it('selects the Qwen adapter for its metadata protocol and bound realtime model', () => {
    const model = 'qwen3-asr-flash-realtime'
    configure(
      {
        qwen: channel('qwen', {
          baseUrl: BAILIAN_WORKSPACE_BASE_URL,
          models: [model],
          metadata: { voiceAsr: { protocol: 'dashscope-qwen-asr-realtime' } }
        })
      },
      { 'audio.asr': [{ providerId: 'qwen', enabled: true, priority: 1, models: [model] }] },
      { qwen: 'secure-qwen-credential' }
    )

    const configured = getConfiguredAsrProvider()

    expect(configured.model).toBe(model)
    expect(configured.provider.id).toBe('dashscope-qwen-asr-realtime')
    expect(adapterOptions.bailian).toEqual([])
    expect(adapterOptions.qwen).toEqual([
      expect.objectContaining({
        credentials: { apiKey: 'secure-qwen-credential', workspaceId: 'workspace-1' },
        streamOptions: { model }
      })
    ])
  })

  it('rejects the incompatible legacy Qwen realtime model before constructing the adapter', () => {
    const legacyModel = 'qwen-audio-3.0-asr-flash-streaming'
    configure(
      {
        qwen: channel('qwen', {
          baseUrl: BAILIAN_WORKSPACE_BASE_URL,
          models: [legacyModel],
          metadata: { voiceAsr: { protocol: 'dashscope-qwen-asr-realtime' } }
        })
      },
      { 'audio.asr': [{ providerId: 'qwen', enabled: true, priority: 1, models: [legacyModel] }] },
      { qwen: 'secure-qwen-credential' }
    )

    expect(() => getConfiguredAsrProvider()).toThrow('VOICE_ASR_MODEL_UNSUPPORTED')
    expect(adapterOptions.qwen).toEqual([])
  })

  it('routes a voice-metadata custom provider when its generic adapter lacks audio.asr support', () => {
    runtime.supportsCapability.mockReturnValue(false)
    configure(
      {
        bailian: channel('bailian', {
          baseUrl: BAILIAN_WORKSPACE_BASE_URL,
          capabilities: ['audio.asr'],
          models: ['paraformer-realtime-v2'],
          metadata: { voiceAsr: { protocol: 'bailian-paraformer' } }
        })
      },
      { 'audio.asr': [{ providerId: 'bailian', priority: 1, models: ['paraformer-realtime-v2'] }] },
      { bailian: 'secure-bailian-credential' }
    )

    const configured = getConfiguredAsrProvider()

    expect(configured.model).toBe('paraformer-realtime-v2')
    expect(configured.provider.id).toBe('bailian-paraformer')
    expect(adapterOptions.bailian).toEqual([
      expect.objectContaining({ streamOptions: { model: 'paraformer-realtime-v2' } })
    ])
  })

  it('rejects Qwen binding models for the Paraformer realtime adapter', () => {
    configure(
      {
        bailian: channel('bailian', {
          baseUrl: BAILIAN_WORKSPACE_BASE_URL,
          models: ['qwen-audio-3.0-asr-flash-filetrans', 'qwen3-asr-flash-realtime'],
          metadata: { voiceAsr: { protocol: 'bailian-paraformer' } }
        })
      },
      {
        'audio.asr': [
          {
            providerId: 'bailian',
            priority: 1,
            models: [
              'qwen-audio-3.0-asr-flash',
              'qwen-audio-3.0-asr-flash-filetrans',
              'qwen3-asr-flash-realtime'
            ]
          }
        ]
      },
      { bailian: 'secure-bailian-credential' }
    )

    expect(() => getConfiguredAsrProvider()).toThrow('VOICE_ASR_MODEL_UNSUPPORTED')
    expect(adapterOptions.bailian).toEqual([])
  })

  it('does not fall back to an enabled custom channel that lacks the audio.asr binding', () => {
    configure(
      {
        unbound: channel('unbound', {
          baseUrl: BAILIAN_PUBLIC_BASE_URL,
          models: ['paraformer-realtime-v2'],
          metadata: { voiceAsr: { protocol: 'bailian-paraformer' } }
        })
      },
      {},
      { unbound: 'secure-unbound-credential' }
    )

    expect(getRecognitionStatus().asr).toEqual({ ready: false, reason: 'VOICE_ASR_NOT_CONFIGURED' })
    expect(() => getConfiguredAsrProvider()).toThrow('VOICE_ASR_NOT_CONFIGURED')
    expect(adapterOptions.bailian).toEqual([])
  })

  it('uses the next eligible binding before capture when the higher-priority channel lacks its credential', () => {
    configure(
      {
        unavailable: channel('unavailable', {
          baseUrl: BAILIAN_PUBLIC_BASE_URL,
          models: ['paraformer-realtime-v2'],
          metadata: { voiceAsr: { protocol: 'bailian-paraformer' } }
        }),
        usable: channel('usable', {
          baseUrl: BAILIAN_WORKSPACE_BASE_URL.replace('workspace-1', 'workspace-usable'),
          models: ['paraformer-realtime-v2'],
          metadata: { voiceAsr: { protocol: 'bailian-paraformer' } }
        })
      },
      {
        'audio.asr': [
          { providerId: 'unavailable', priority: 1, models: ['paraformer-realtime-v2'] },
          { providerId: 'usable', priority: 2, models: ['paraformer-realtime-v2'] }
        ]
      },
      { usable: 'secure-usable-credential' }
    )

    const configured = getConfiguredAsrProvider()

    expect(configured.model).toBe('paraformer-realtime-v2')
    expect(adapterOptions.bailian).toEqual([
      expect.objectContaining({
        credentials: { apiKey: 'secure-usable-credential', workspaceId: 'workspace-usable' }
      })
    ])
  })

  it.each([
    {
      name: 'selected channel no longer implements the bound capability',
      provider: channel('wrong-capability', {
        baseUrl: BAILIAN_WORKSPACE_BASE_URL,
        capabilities: ['audio.stt'],
        models: ['paraformer-realtime-v2']
      }),
      credential: 'secure-credential',
      reason: 'VOICE_ASR_PROVIDER_UNAVAILABLE'
    },
    {
      name: 'selected channel has no secure credential',
      provider: channel('missing-credential', {
        baseUrl: BAILIAN_WORKSPACE_BASE_URL,
        models: ['paraformer-realtime-v2'],
        metadata: { voiceAsr: { protocol: 'bailian-paraformer' } }
      }),
      credential: undefined,
      reason: 'VOICE_ASR_CREDENTIAL_UNAVAILABLE'
    }
  ])('fails closed when $name', ({ provider, credential, reason }) => {
    const providerId = provider.getConfig().id
    configure(
      { [providerId]: provider },
      { 'audio.asr': [{ providerId, priority: 1, models: ['paraformer-realtime-v2'] }] },
      credential ? { [providerId]: credential } : {}
    )

    expect(() => getConfiguredAsrProvider()).toThrow(reason)
    expect(adapterOptions.bailian).toEqual([])
    expect(adapterOptions.doubao).toEqual([])
  })
})
