import { beforeEach, describe, expect, it, vi } from 'vitest'

const runtime = vi.hoisted(() => ({
  bindings: {} as Record<string, Array<Record<string, unknown>>>,
  providers: {} as Record<string, { getConfig: () => Record<string, unknown> }>,
  credentials: {} as Record<string, string>,
  nexusBaseUrl: 'https://nexus.example.test',
  ensureLoaded: vi.fn(),
  supportsCapability: vi.fn(),
  stt: vi.fn(),
  authToken: 'nexus-session-token' as string | null,
  authUserId: 'user-1' as string | null
}))
const catalog = vi.hoisted(() => ({
  registry: null as null | {
    packId: string
    version: string
    minSdkApi: number
    expiry?: string
    get: (id: string) => unknown
  },
  status: null as null | { lastErrorCode: string | null }
}))
const nexusClient = vi.hoisted(() => ({ transcribeNexusAudio: vi.fn() }))
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
  providerSupportsCapability: runtime.supportsCapability,
  tuffIntelligence: { audio: { stt: runtime.stt } }
}))
vi.mock('../ai/provider-credential-runtime', () => ({
  resolveProviderCredential: (provider: { id: string }) => runtime.credentials[provider.id]
}))
vi.mock('../catalog', () => ({
  getCatalogService: () => ({
    getVoiceProviderRegistry: () => catalog.registry,
    getVoiceProviderStatus: () => catalog.status
  })
}))
vi.mock('../nexus/asr-client', () => nexusClient)
vi.mock('../nexus/runtime-base', () => ({
  getRuntimeNexusBaseUrl: () => runtime.nexusBaseUrl
}))
// The Nexus-managed route is authorised by the signed-in session token rather than a per-provider
// credential, so the fallback path is only reachable with a token present.
vi.mock('../auth', () => ({
  getAuthToken: () => runtime.authToken,
  getSanitizedAuthSessionState: () => ({
    isLoaded: true,
    isSignedIn: runtime.authUserId !== null,
    user: runtime.authUserId ? { id: runtime.authUserId } : null
  })
}))
vi.mock('@talex-touch/tuff-voice', () => ({
  createFetchHttpClient: vi.fn(() => ({ request: vi.fn() })),
  createNodeVoiceSocketFactory: vi.fn(() => ({ connect: vi.fn() })),
  VoiceProviderError: class VoiceProviderError extends Error {
    readonly code: string
    readonly retryable = false

    constructor(code: string, message: string) {
      super(message)
      this.name = 'VoiceProviderError'
      this.code = code
    }
  },
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

import { NEXUS_AUDIO_TRANSCRIBE_MODEL } from '@talex-touch/utils/types/intelligence'
import type {
  VoiceProviderAdapter,
  VoiceProviderEvent,
  VoiceStreamRequest
} from '@talex-touch/tuff-voice'
import { CATALOG_CLIENT_SDKAPI, CATALOG_ERROR_CODES } from '@talex-touch/utils/i18n'
import type { VoiceProviderDescriptorV1 } from '@talex-touch/utils/i18n'
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

/** The Nexus-managed audio.stt route: batch transcription, never a realtime ASR socket. */
function nexusSttChannel() {
  return channel('tuff-nexus-default', {
    capabilities: ['audio.stt'],
    models: [NEXUS_AUDIO_TRANSCRIBE_MODEL],
    metadata: { origin: 'tuff-nexus' }
  })
}

function nexusSttBinding() {
  return {
    providerId: 'tuff-nexus-default',
    enabled: true,
    priority: 1,
    models: [NEXUS_AUDIO_TRANSCRIBE_MODEL]
  }
}

const PACK_PROVIDER_ID = 'tuff-nexus-cloud'
const PACK_MODEL = 'catalog.audio.transcribe'

/** A frozen descriptor as the active catalog registry would hand it to the runtime. */
function catalogDescriptor(
  overrides: Partial<VoiceProviderDescriptorV1> = {}
): VoiceProviderDescriptorV1 {
  return {
    id: PACK_PROVIDER_ID,
    displayName: { default: 'Nexus cloud ASR' },
    protocol: 'nexus-pack',
    transport: 'http-upload',
    endpoint: {
      baseUrl: 'https://nexus.example.test',
      submitPath: '/api/v1/ai/audio/transcribe',
      pollPath: '/api/v1/ai/audio/transcriptions/:requestId'
    },
    auth: { mode: 'nexus-session' },
    request: {
      body: 'raw-bytes',
      contentTypePolicy: 'audio/*',
      idempotencyHeader: 'x-idempotency-key'
    },
    models: [{ id: PACK_MODEL }],
    limits: { maxBytes: 20 * 1024 * 1024, maxDurationSec: 600, timeoutMs: 600_000 },
    ...overrides
  }
}

function activeRegistry(
  descriptor: VoiceProviderDescriptorV1,
  overrides: { minSdkApi?: number; expiry?: string } = {}
) {
  return {
    packId: 'official.voice-provider',
    version: '7',
    minSdkApi: overrides.minSdkApi ?? CATALOG_CLIENT_SDKAPI,
    ...(overrides.expiry ? { expiry: overrides.expiry } : {}),
    get: (id: string) => (id === descriptor.id ? descriptor : undefined)
  }
}

function nexusPackChannel(options: { models?: string[] } = {}) {
  return channel(PACK_PROVIDER_ID, {
    capabilities: ['audio.asr'],
    models: options.models ?? [PACK_MODEL],
    metadata: { origin: 'tuff-nexus', voiceAsr: { protocol: 'nexus-pack' } }
  })
}

function nexusPackBinding(models: string[] = [PACK_MODEL]) {
  return { providerId: PACK_PROVIDER_ID, enabled: true, priority: 1, models }
}

/** Pack failures carry the stable code on the error, not in its human-readable message. */
function expectVoiceProviderCode(run: () => unknown, code: string): void {
  let failure: unknown
  try {
    run()
  } catch (error) {
    failure = error
  }
  expect(failure).toMatchObject({ code })
}
describe('capability-bound voice ASR provider resolution', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    runtime.bindings = {}
    runtime.providers = {}
    runtime.credentials = {}
    runtime.authToken = 'nexus-session-token'
    runtime.authUserId = 'user-1'
    runtime.nexusBaseUrl = 'https://nexus.example.test'
    runtime.stt.mockReset()
    catalog.registry = null
    catalog.status = null
    nexusClient.transcribeNexusAudio.mockReset()
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

  it('falls back to the ready Nexus audio.stt route as a buffered stream when audio.asr is unbound', () => {
    configure({ 'tuff-nexus-default': nexusSttChannel() }, { 'audio.stt': [nexusSttBinding()] })

    expect(getRecognitionStatus().asr).toEqual({ ready: true, mode: 'buffered' })

    const configured = getConfiguredAsrProvider()

    expect(configured.mode).toBe('buffered')
    expect(configured.model).toBe(NEXUS_AUDIO_TRANSCRIBE_MODEL)
    expect(configured.provider.id).toBe('nexus-audio-stt-buffered')
    expect(adapterOptions.bailian).toEqual([])
    expect(adapterOptions.qwen).toEqual([])
    expect(adapterOptions.doubao).toEqual([])
  })

  it.each([
    {
      name: 'the bound channel no longer implements audio.asr',
      asr: channel('degraded-asr', {
        baseUrl: BAILIAN_WORKSPACE_BASE_URL,
        capabilities: ['audio.stt'],
        models: ['paraformer-realtime-v2']
      }),
      credential: 'secure-asr-credential',
      reason: 'VOICE_ASR_PROVIDER_UNAVAILABLE'
    },
    {
      name: 'the bound channel has no secure credential',
      asr: channel('uncredentialed-asr', {
        baseUrl: BAILIAN_WORKSPACE_BASE_URL,
        models: ['paraformer-realtime-v2'],
        metadata: { voiceAsr: { protocol: 'bailian-paraformer' } }
      }),
      credential: undefined,
      reason: 'VOICE_ASR_CREDENTIAL_UNAVAILABLE'
    }
  ])('does not fall back to buffered audio.stt when $name', ({ asr, credential, reason }) => {
    const providerId = asr.getConfig().id
    configure(
      { [providerId]: asr, 'tuff-nexus-default': nexusSttChannel() },
      {
        'audio.asr': [
          { providerId, enabled: true, priority: 1, models: ['paraformer-realtime-v2'] }
        ],
        'audio.stt': [nexusSttBinding()]
      },
      credential ? { [providerId]: credential } : {}
    )

    expect(getRecognitionStatus().asr).toEqual({ ready: false, reason })
    expect(() => getConfiguredAsrProvider()).toThrow(reason)
    expect(adapterOptions.bailian).toEqual([])
  })

  function bufferedRequest(): VoiceStreamRequest {
    return {
      model: NEXUS_AUDIO_TRANSCRIBE_MODEL,
      requestId: 'req-buffered-1',
      audio: { format: 'pcm', sampleRate: 16_000, channels: 1, bitsPerSample: 16 }
    }
  }

  async function collect(events: AsyncIterable<VoiceProviderEvent>): Promise<VoiceProviderEvent[]> {
    const out: VoiceProviderEvent[] = []
    for await (const event of events) out.push(event)
    return out
  }

  async function recordClip(provider: VoiceProviderAdapter): Promise<VoiceProviderEvent[]> {
    const stream = await provider.createStream(bufferedRequest())
    await stream.writePcm(new Uint8Array([0x01, 0x02]))
    await stream.end()
    return await collect(stream.events)
  }

  it('freezes the capture-start account so a later switch aborts the recording without calling STT', async () => {
    configure({ 'tuff-nexus-default': nexusSttChannel() }, { 'audio.stt': [nexusSttBinding()] })
    // Resolving before capture is what fixes user-1 as the owner of this recording; later
    // attempts must reuse that provider rather than re-resolving under the new account.
    const provider = getConfiguredAsrProvider().provider
    runtime.authUserId = 'user-2'

    const events = await recordClip(provider)

    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      type: 'error',
      code: 'VOICE_ASR_AUTHORITY_CHANGED',
      retryable: false
    })
    // The upload is what must not happen: a switched account must not bill or leak the audio.
    expect(runtime.stt).not.toHaveBeenCalled()
  })

  it('freezes the capture-start Nexus origin so a later origin switch aborts without calling STT', async () => {
    configure({ 'tuff-nexus-default': nexusSttChannel() }, { 'audio.stt': [nexusSttBinding()] })
    const provider = getConfiguredAsrProvider().provider
    runtime.nexusBaseUrl = 'https://attacker.example.com'

    const events = await recordClip(provider)

    expect(events[0]).toMatchObject({ type: 'error', code: 'VOICE_ASR_AUTHORITY_CHANGED' })
    expect(runtime.stt).not.toHaveBeenCalled()
  })

  it('keeps the frozen recording usable across a same-account token refresh', async () => {
    configure({ 'tuff-nexus-default': nexusSttChannel() }, { 'audio.stt': [nexusSttBinding()] })
    runtime.stt.mockResolvedValueOnce({ result: { text: 'hello' } })
    const provider = getConfiguredAsrProvider().provider
    // A re-issued access token is the same principal and origin; it must not invalidate the hold.
    runtime.authToken = 'refreshed-session-token'

    const events = await recordClip(provider)

    expect(events.map((event) => event.type)).toEqual(['final', 'end'])
    expect(events[0]).toMatchObject({ type: 'final', text: 'hello' })
    expect(runtime.stt).toHaveBeenCalledTimes(1)
  })

  it('drives the resolved nexus-pack descriptor through the buffered adapter and the Nexus client', async () => {
    const descriptor = catalogDescriptor()
    configure({ [PACK_PROVIDER_ID]: nexusPackChannel() }, { 'audio.asr': [nexusPackBinding()] })
    catalog.registry = activeRegistry(descriptor)
    catalog.status = { lastErrorCode: null }
    nexusClient.transcribeNexusAudio.mockResolvedValue({
      text: 'pack transcript',
      billing: { requestId: 'pack-1', creditsCharged: 3, billedSeconds: 2 }
    })

    expect(getRecognitionStatus().asr).toEqual({ ready: true, mode: 'buffered' })

    const configured = getConfiguredAsrProvider()
    expect(configured.mode).toBe('buffered')
    expect(configured.model).toBe(PACK_MODEL)
    expect(configured.provider.id).toBe('nexus-audio-stt-buffered')

    const stream = await configured.provider.createStream({
      model: 'client-requested-model',
      requestId: 'req-pack-1',
      audio: { format: 'pcm', sampleRate: 16_000, channels: 1, bitsPerSample: 16 }
    })
    await stream.writePcm(Buffer.from([0x01, 0x02, 0x03, 0x04]))
    await stream.end()

    const events: unknown[] = []
    for await (const event of stream.events) events.push(event)
    expect(events).toEqual([
      {
        type: 'final',
        text: 'pack transcript',
        requestId: 'req-pack-1',
        usage: { durationMs: 2000 }
      },
      { type: 'end', requestId: 'req-pack-1' }
    ])

    expect(nexusClient.transcribeNexusAudio).toHaveBeenCalledTimes(1)
    const [payload, options] = nexusClient.transcribeNexusAudio.mock.calls[0]
    expect(options.route).toBe(descriptor)
    expect(options.timeout).toBe(descriptor.limits.timeoutMs)
    expect(payload).toMatchObject({ format: 'wav' })
    expect(payload.audio).toMatch(/^data:audio\/wav;base64,/)
  })

  it.each([
    { name: 'no active pack', errorCode: null, reason: 'VOICE_ASR_PACK_NOT_CONFIGURED' },
    {
      name: 'an expired pack',
      errorCode: CATALOG_ERROR_CODES.packExpired,
      reason: 'VOICE_ASR_PACK_EXPIRED'
    },
    {
      name: 'a forged signature',
      errorCode: CATALOG_ERROR_CODES.signatureInvalid,
      reason: 'VOICE_ASR_PACK_SIGNATURE_INVALID'
    },
    {
      name: 'a hash mismatch',
      errorCode: CATALOG_ERROR_CODES.hashMismatch,
      reason: 'VOICE_ASR_PACK_SIGNATURE_INVALID'
    },
    {
      name: 'an invalid manifest',
      errorCode: CATALOG_ERROR_CODES.manifestInvalid,
      reason: 'VOICE_ASR_PACK_SCHEMA_INVALID'
    },
    {
      name: 'a failed payload decrypt',
      errorCode: CATALOG_ERROR_CODES.payloadDecryptFailed,
      reason: 'VOICE_ASR_PACK_SCHEMA_INVALID'
    },
    {
      name: 'an incompatible sdkapi',
      errorCode: CATALOG_ERROR_CODES.sdkIncompatible,
      reason: 'VOICE_ASR_PACK_UNSUPPORTED'
    },
    {
      name: 'an unsupported catalog type',
      errorCode: CATALOG_ERROR_CODES.typeUnsupported,
      reason: 'VOICE_ASR_PACK_UNSUPPORTED'
    }
  ])(
    'fails an explicit nexus-pack binding closed with $reason for $name',
    ({ errorCode, reason }) => {
      configure({ [PACK_PROVIDER_ID]: nexusPackChannel() }, { 'audio.asr': [nexusPackBinding()] })
      catalog.registry = null
      catalog.status = { lastErrorCode: errorCode }

      expect(getRecognitionStatus().asr).toEqual({ ready: false, reason })
      expectVoiceProviderCode(getConfiguredAsrProvider, reason)
      expect(nexusClient.transcribeNexusAudio).not.toHaveBeenCalled()
    }
  )

  it.each([
    {
      name: 'an expired active pack',
      descriptor: catalogDescriptor(),
      registry: { expiry: '2000-01-01T00:00:00.000Z' },
      reason: 'VOICE_ASR_PACK_EXPIRED'
    },
    {
      name: 'a pack that requires a newer client sdkapi',
      descriptor: catalogDescriptor(),
      registry: { minSdkApi: CATALOG_CLIENT_SDKAPI + 1 },
      reason: 'VOICE_ASR_PACK_UNSUPPORTED'
    },
    {
      name: 'a descriptor whose transport is not the supported upload shape',
      descriptor: catalogDescriptor({ transport: 'http-realtime' }),
      registry: {},
      reason: 'VOICE_ASR_PACK_UNSUPPORTED'
    },
    {
      name: 'a descriptor whose endpoint origin is not the runtime Nexus origin',
      descriptor: catalogDescriptor({
        endpoint: {
          baseUrl: 'https://evil.example.test',
          submitPath: '/submit',
          pollPath: '/poll/:requestId'
        }
      }),
      registry: {},
      reason: 'VOICE_ASR_PACK_UNSUPPORTED'
    }
  ])(
    'refuses an explicit nexus-pack binding for $name with $reason',
    ({ descriptor, registry, reason }) => {
      configure({ [PACK_PROVIDER_ID]: nexusPackChannel() }, { 'audio.asr': [nexusPackBinding()] })
      catalog.registry = activeRegistry(descriptor, registry)
      catalog.status = { lastErrorCode: null }

      expect(getRecognitionStatus().asr).toEqual({ ready: false, reason })
      expectVoiceProviderCode(getConfiguredAsrProvider, reason)
      expect(nexusClient.transcribeNexusAudio).not.toHaveBeenCalled()
    }
  )

  it('rejects a nexus-pack descriptor that does not offer the resolved model', () => {
    configure(
      { [PACK_PROVIDER_ID]: nexusPackChannel({ models: ['bound.model'] }) },
      { 'audio.asr': [nexusPackBinding(['bound.model'])] }
    )
    catalog.registry = activeRegistry(catalogDescriptor({ models: [{ id: 'descriptor.model' }] }))
    catalog.status = { lastErrorCode: null }

    expect(getRecognitionStatus().asr).toEqual({
      ready: false,
      reason: 'VOICE_ASR_PACK_UNSUPPORTED'
    })
    expectVoiceProviderCode(getConfiguredAsrProvider, 'VOICE_ASR_PACK_UNSUPPORTED')
    expect(nexusClient.transcribeNexusAudio).not.toHaveBeenCalled()
  })

  it('keeps the built-in buffered adapter on the implicit Nexus audio.stt fallback when no pack is active', () => {
    configure(
      {
        'tuff-nexus-default': channel('tuff-nexus-default', {
          capabilities: ['audio.stt'],
          models: [NEXUS_AUDIO_TRANSCRIBE_MODEL],
          metadata: { origin: 'tuff-nexus', voiceAsr: { protocol: 'nexus-pack' } }
        })
      },
      { 'audio.stt': [nexusSttBinding()] }
    )
    catalog.registry = null
    catalog.status = { lastErrorCode: null }

    expect(getRecognitionStatus().asr).toEqual({ ready: true, mode: 'buffered' })

    const configured = getConfiguredAsrProvider()
    expect(configured.mode).toBe('buffered')
    expect(configured.model).toBe(NEXUS_AUDIO_TRANSCRIBE_MODEL)
    expect(configured.provider.id).toBe('nexus-audio-stt-buffered')
    expect(nexusClient.transcribeNexusAudio).not.toHaveBeenCalled()
  })
})
