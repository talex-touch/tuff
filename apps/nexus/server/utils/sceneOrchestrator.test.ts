import type { ProviderRegistryRecord } from './providerRegistryStore'
import type { SceneRegistryRecord } from './sceneRegistryStore'
import { Buffer } from 'node:buffer'
import { randomUUID } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getPlatformGovernanceAnalytics,
  listPlatformGovernanceEvents,
  recordPlatformGovernanceEvent,
  upsertPlatformGovernanceConfig,
} from './platformGovernanceStore'
import { buildSceneAssetGovernanceResourceId, requireSceneAsset } from './sceneAssetStorage'
import { resolveSceneCapabilityAdapterReadiness } from './sceneCapabilityAdapterRegistry'
import {
  clearSceneCapabilityAdaptersForTest,
  registerSceneCapabilityAdapter,
  resetSceneCapabilityAdaptersForTest,
  runSceneOrchestrator,
} from './sceneOrchestrator'

const storeMocks = vi.hoisted(() => ({
  getProviderRegistryEntry: vi.fn(),
  getSceneRegistryEntry: vi.fn(),
}))

const ledgerMocks = vi.hoisted(() => ({
  recordProviderUsageLedger: vi.fn(),
}))

const healthMocks = vi.hoisted(() => ({
  getLatestProviderHealthChecks: vi.fn(),
}))

const fxMocks = vi.hoisted(() => ({
  getUsdRates: vi.fn(),
  convertUsd: vi.fn(),
}))

const intelligenceOcrMocks = vi.hoisted(() => ({
  invokeIntelligenceVisionOcr: vi.fn(),
}))

const credentialMocks = vi.hoisted(() => ({
  getProviderCredential: vi.fn(),
}))

const networkMocks = vi.hoisted(() => ({
  request: vi.fn(),
}))

vi.mock('./providerRegistryStore', () => ({
  getProviderRegistryEntry: storeMocks.getProviderRegistryEntry,
}))

vi.mock('./sceneRegistryStore', () => ({
  getSceneRegistryEntry: storeMocks.getSceneRegistryEntry,
}))

vi.mock('./providerUsageLedgerStore', () => ledgerMocks)
vi.mock('./providerHealthStore', () => healthMocks)
vi.mock('./exchangeRateService', () => fxMocks)
vi.mock('./intelligenceVisionOcrProvider', () => intelligenceOcrMocks)
vi.mock('./providerCredentialStore', () => credentialMocks)
vi.mock('@talex-touch/utils/network', () => ({
  networkClient: {
    request: networkMocks.request,
  },
}))

function provider(overrides: Partial<ProviderRegistryRecord> = {}): ProviderRegistryRecord {
  return {
    id: 'prv_tencent_cloud_mt',
    name: 'tencent-cloud-mt-main',
    displayName: 'Tencent Cloud Machine Translation',
    vendor: 'tencent-cloud',
    status: 'enabled',
    authType: 'secret_pair',
    authRef: 'secure://providers/tencent-cloud-mt-main',
    ownerScope: 'system',
    ownerId: null,
    description: null,
    endpoint: 'https://tmt.tencentcloudapi.com',
    region: 'ap-shanghai',
    metadata: null,
    capabilities: [
      {
        id: 'cap_text_translate',
        providerId: 'prv_tencent_cloud_mt',
        capability: 'text.translate',
        schemaRef: 'nexus://schemas/provider/text-translate.v1',
        metering: { unit: 'character' },
        constraints: null,
        metadata: null,
        createdAt: '2026-05-10T00:00:00.000Z',
        updatedAt: '2026-05-10T00:00:00.000Z',
      },
    ],
    createdBy: 'admin_1',
    createdAt: '2026-05-10T00:00:00.000Z',
    updatedAt: '2026-05-10T00:00:00.000Z',
    ...overrides,
  }
}

function textTranslateCapability(providerId: string) {
  return {
    id: `cap_text_translate_${providerId}`,
    providerId,
    capability: 'text.translate',
    schemaRef: 'nexus://schemas/provider/text-translate.v1',
    metering: { unit: 'character' },
    constraints: null,
    metadata: null,
    createdAt: '2026-05-10T00:00:00.000Z',
    updatedAt: '2026-05-10T00:00:00.000Z',
  }
}

function fxCapability(providerId: string, capability: 'fx.rate.latest' | 'fx.convert') {
  return {
    id: `cap_${capability}_${providerId}`,
    providerId,
    capability,
    schemaRef: `nexus://schemas/provider/${capability}.v1`,
    metering: { unit: 'fx_quote' },
    constraints: null,
    metadata: null,
    createdAt: '2026-05-10T00:00:00.000Z',
    updatedAt: '2026-05-10T00:00:00.000Z',
  }
}

function capability(providerId: string, capabilityName: string, unit = 'request') {
  return {
    id: `cap_${capabilityName.replaceAll('.', '_')}_${providerId}`,
    providerId,
    capability: capabilityName,
    schemaRef: `nexus://schemas/provider/${capabilityName}.v1`,
    metering: { unit },
    constraints: null,
    metadata: null,
    createdAt: '2026-05-10T00:00:00.000Z',
    updatedAt: '2026-05-10T00:00:00.000Z',
  }
}

function binding(providerId: string, capabilityName: string, priority: number): SceneRegistryRecord['bindings'][number] {
  return {
    id: `binding_${capabilityName.replaceAll('.', '_')}_${providerId}`,
    sceneId: 'corebox.screenshot.translate',
    providerId,
    capability: capabilityName,
    priority,
    weight: null,
    status: 'enabled',
    constraints: null,
    metadata: null,
    createdAt: '2026-05-10T00:00:00.000Z',
    updatedAt: '2026-05-10T00:00:00.000Z',
  }
}

function scene(overrides: Partial<SceneRegistryRecord> = {}): SceneRegistryRecord {
  return {
    id: 'corebox.selection.translate',
    displayName: 'CoreBox Selection Translate',
    owner: 'core-app',
    ownerScope: 'system',
    ownerId: null,
    status: 'enabled',
    requiredCapabilities: ['text.translate'],
    strategyMode: 'priority',
    fallback: 'enabled',
    meteringPolicy: null,
    auditPolicy: { persistInput: false, persistOutput: false },
    metadata: null,
    bindings: [
      {
        id: 'binding_text_translate',
        sceneId: 'corebox.selection.translate',
        providerId: 'prv_tencent_cloud_mt',
        capability: 'text.translate',
        priority: 10,
        weight: null,
        status: 'enabled',
        constraints: null,
        metadata: null,
        createdAt: '2026-05-10T00:00:00.000Z',
        updatedAt: '2026-05-10T00:00:00.000Z',
      },
    ],
    createdBy: 'admin_1',
    createdAt: '2026-05-10T00:00:00.000Z',
    updatedAt: '2026-05-10T00:00:00.000Z',
    ...overrides,
  }
}

function makeEvent() {
  return {
    path: '/api/dashboard/provider-registry/scenes/corebox.selection.translate/run',
    node: { req: { url: '/api/dashboard/provider-registry/scenes/corebox.selection.translate/run' } },
    context: { params: {} },
  } as any
}

function makeBucket(failWrites = 0) {
  const objects = new Map<string, { data: Buffer, contentType: string }>()
  let attempts = 0

  return {
    get attempts() {
      return attempts
    },
    event() {
      return {
        path: '/api/dashboard/provider-registry/scenes/corebox.selection.translate/run',
        node: { req: { url: '/api/dashboard/provider-registry/scenes/corebox.selection.translate/run' } },
        context: {
          params: {},
          cloudflare: {
            env: {
              ASSETS: this,
            },
          },
        },
      } as any
    },
    put: async (key: string, data: Uint8Array, options?: { httpMetadata?: { contentType?: string } }) => {
      attempts += 1
      if (attempts <= failWrites) {
        throw Object.assign(new Error('Transient scene asset write failure'), {
          statusCode: 503,
        })
      }
      objects.set(key, {
        data: Buffer.from(data.buffer, data.byteOffset, data.byteLength),
        contentType: options?.httpMetadata?.contentType || 'application/octet-stream',
      })
    },
    get: async (key: string) => {
      const object = objects.get(key)
      if (!object)
        return null
      return {
        httpMetadata: {
          contentType: object.contentType,
        },
        arrayBuffer: async () => object.data.buffer.slice(
          object.data.byteOffset,
          object.data.byteOffset + object.data.byteLength,
        ),
      }
    },
    delete: async (key: string) => {
      objects.delete(key)
    },
    list: async () => ({
      objects: Array.from(objects.keys()).map(key => ({ key })),
    }),
  }
}

describe('runSceneOrchestrator', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearSceneCapabilityAdaptersForTest()
    storeMocks.getSceneRegistryEntry.mockResolvedValue(scene())
    storeMocks.getProviderRegistryEntry.mockResolvedValue(provider())
    ledgerMocks.recordProviderUsageLedger.mockResolvedValue([])
    healthMocks.getLatestProviderHealthChecks.mockResolvedValue(new Map())
    credentialMocks.getProviderCredential.mockResolvedValue({ apiKey: 'sk-test' })
    networkMocks.request.mockResolvedValue({
      status: 200,
      data: {
        id: 'resp_1',
        output_text: 'hello from responses',
        usage: { input_tokens: 3, output_tokens: 4, total_tokens: 7 },
      },
    })
  })

  it('exposes provider capability adapter readiness for registry convergence', () => {
    const exactProvider = provider()
    registerSceneCapabilityAdapter('tencent-cloud:text.translate', async () => ({ output: null }))

    expect(resolveSceneCapabilityAdapterReadiness(exactProvider, 'text.translate')).toEqual({
      providerId: exactProvider.id,
      vendor: 'tencent-cloud',
      capability: 'text.translate',
      ready: true,
      matchedKey: 'tencent-cloud:text.translate',
      fallbackKey: null,
      reason: 'adapter-ready',
    })

    clearSceneCapabilityAdaptersForTest()
    registerSceneCapabilityAdapter('*:text.translate', async () => ({ output: null }))

    expect(resolveSceneCapabilityAdapterReadiness(exactProvider, 'text.translate')).toEqual({
      providerId: exactProvider.id,
      vendor: 'tencent-cloud',
      capability: 'text.translate',
      ready: true,
      matchedKey: '*:text.translate',
      fallbackKey: 'tencent-cloud:text.translate',
      reason: 'adapter-ready',
    })

    clearSceneCapabilityAdaptersForTest()

    expect(resolveSceneCapabilityAdapterReadiness(exactProvider, 'text.translate')).toMatchObject({
      ready: false,
      matchedKey: null,
      fallbackKey: 'tencent-cloud:text.translate',
      reason: 'adapter-missing',
    })
    expect(resolveSceneCapabilityAdapterReadiness(exactProvider, 'image.translate')).toMatchObject({
      ready: false,
      matchedKey: null,
      fallbackKey: null,
      reason: 'provider-capability-missing',
    })
  })

  it('marks default AI text adapters as ready for provider registry templates', () => {
    resetSceneCapabilityAdaptersForTest()
    const openAiProvider = provider({
      id: 'prv_openai_responses',
      vendor: 'openai',
      capabilities: [
        capability('prv_openai_responses', 'chat.completion', 'token'),
        capability('prv_openai_responses', 'text.summarize', 'token'),
        capability('prv_openai_responses', 'content.extract', 'token'),
      ],
    })

    expect(resolveSceneCapabilityAdapterReadiness(openAiProvider, 'chat.completion')).toMatchObject({
      ready: true,
      matchedKey: 'openai:chat.completion',
    })
    expect(resolveSceneCapabilityAdapterReadiness(openAiProvider, 'text.summarize')).toMatchObject({
      ready: true,
      matchedKey: 'openai:text.summarize',
    })
    expect(resolveSceneCapabilityAdapterReadiness(openAiProvider, 'content.extract')).toMatchObject({
      ready: true,
      matchedKey: 'openai:content.extract',
    })
  })

  it('dry run 只解析 scene、provider 与 strategy，不调用 adapter', async () => {
    const run = await runSceneOrchestrator(makeEvent(), 'corebox.selection.translate', {
      input: { text: 'hello' },
      dryRun: true,
    })

    expect(run).toMatchObject({
      sceneId: 'corebox.selection.translate',
      status: 'planned',
      mode: 'dry_run',
      strategyMode: 'priority',
      requestedCapabilities: ['text.translate'],
      selected: [
        expect.objectContaining({
          providerId: 'prv_tencent_cloud_mt',
          capability: 'text.translate',
          authRef: 'secure://providers/tencent-cloud-mt-main',
        }),
      ],
      output: null,
    })
    expect(run.trace.map(item => item.phase)).toContain('adapter.dispatch')
    expect(storeMocks.getProviderRegistryEntry).toHaveBeenCalledWith(expect.anything(), 'prv_tencent_cloud_mt')
    expect(ledgerMocks.recordProviderUsageLedger).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      runId: run.runId,
      status: 'planned',
      mode: 'dry_run',
    }))
  })

  it('默认 OpenAI Responses adapter 调用 /responses 并返回标准 output/usage', async () => {
    resetSceneCapabilityAdaptersForTest()
    const openAiProvider = provider({
      id: 'prv_openai_responses',
      name: 'openai-responses-ai-main',
      displayName: 'OpenAI Responses',
      vendor: 'openai',
      authType: 'api_key',
      authRef: 'secure://providers/openai-responses-ai-main',
      endpoint: 'https://api.openai.com/v1',
      metadata: {
        source: 'intelligence',
        transport: 'responses',
        intelligenceType: 'openai',
        defaultModel: 'gpt-4.1-mini',
      },
      capabilities: [
        capability('prv_openai_responses', 'chat.completion', 'token'),
      ],
    })
    storeMocks.getProviderRegistryEntry.mockResolvedValue(openAiProvider)
    storeMocks.getSceneRegistryEntry.mockResolvedValue(scene({
      id: 'nexus.intelligence.chat',
      requiredCapabilities: ['chat.completion'],
      bindings: [
        {
          ...binding('prv_openai_responses', 'chat.completion', 10),
          sceneId: 'nexus.intelligence.chat',
        },
      ],
    }))

    const run = await runSceneOrchestrator(makeEvent(), 'nexus.intelligence.chat', {
      input: { messages: [{ role: 'user', content: 'hello' }] },
    })

    expect(credentialMocks.getProviderCredential).toHaveBeenCalledWith(
      expect.anything(),
      'secure://providers/openai-responses-ai-main',
    )
    expect(networkMocks.request).toHaveBeenCalledWith(expect.objectContaining({
      method: 'POST',
      url: 'https://api.openai.com/v1/responses',
      headers: expect.objectContaining({ Authorization: 'Bearer sk-test' }),
      body: expect.objectContaining({
        model: 'gpt-4.1-mini',
        input: 'user: hello',
        store: false,
      }),
    }))
    expect(run).toMatchObject({
      status: 'completed',
      output: 'hello from responses',
      usage: [
        expect.objectContaining({
          unit: 'token',
          quantity: 7,
          providerId: 'prv_openai_responses',
          capability: 'chat.completion',
          model: 'gpt-4.1-mini',
          providerType: 'openai',
        }),
      ],
    })
  })

  it('默认 OpenAI-compatible adapter 调用 /chat/completions 支持摘要场景', async () => {
    resetSceneCapabilityAdaptersForTest()
    networkMocks.request.mockResolvedValueOnce({
      status: 200,
      data: {
        id: 'chatcmpl_1',
        choices: [{ message: { content: 'short summary' } }],
        usage: { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 },
      },
    })
    const openAiProvider = provider({
      id: 'prv_openai_compat',
      name: 'openai-compatible-ai-main',
      displayName: 'OpenAI Compatible AI',
      vendor: 'openai',
      authType: 'api_key',
      authRef: 'secure://providers/openai-compatible-ai-main',
      endpoint: 'https://api.openai.com/v1',
      metadata: {
        source: 'intelligence',
        transport: 'chat.completions',
        intelligenceType: 'openai',
        defaultModel: 'gpt-4.1-mini',
      },
      capabilities: [
        capability('prv_openai_compat', 'text.summarize', 'token'),
      ],
    })
    storeMocks.getProviderRegistryEntry.mockResolvedValue(openAiProvider)
    storeMocks.getSceneRegistryEntry.mockResolvedValue(scene({
      id: 'nexus.intelligence.summarize',
      requiredCapabilities: ['text.summarize'],
      bindings: [
        {
          ...binding('prv_openai_compat', 'text.summarize', 10),
          sceneId: 'nexus.intelligence.summarize',
        },
      ],
    }))

    const run = await runSceneOrchestrator(makeEvent(), 'nexus.intelligence.summarize', {
      input: { text: 'Long text for summarization.', style: 'concise' },
    })

    expect(networkMocks.request).toHaveBeenCalledWith(expect.objectContaining({
      method: 'POST',
      url: 'https://api.openai.com/v1/chat/completions',
      body: expect.objectContaining({
        model: 'gpt-4.1-mini',
        messages: expect.arrayContaining([
          expect.objectContaining({ role: 'system', content: expect.stringContaining('summarization assistant') }),
          expect.objectContaining({ role: 'user', content: 'Long text for summarization.' }),
        ]),
      }),
    }))
    expect(run).toMatchObject({
      status: 'completed',
      output: 'short summary',
      usage: [
        expect.objectContaining({
          quantity: 8,
          providerId: 'prv_openai_compat',
          capability: 'text.summarize',
        }),
      ],
    })
  })

  it('OpenAI adapter failure returns provider error message in failed scene run', async () => {
    resetSceneCapabilityAdaptersForTest()
    networkMocks.request.mockResolvedValueOnce({
      status: 401,
      data: {
        error: {
          message: 'Incorrect API key provided.',
        },
      },
    })
    const openAiProvider = provider({
      id: 'prv_openai_extract',
      name: 'openai-compatible-ai-main',
      displayName: 'OpenAI Compatible AI',
      vendor: 'openai',
      authType: 'api_key',
      authRef: 'secure://providers/openai-compatible-ai-main',
      endpoint: 'https://api.openai.com/v1',
      metadata: {
        source: 'intelligence',
        transport: 'chat.completions',
        intelligenceType: 'openai',
        defaultModel: 'gpt-4.1-mini',
      },
      capabilities: [
        capability('prv_openai_extract', 'content.extract', 'token'),
      ],
    })
    storeMocks.getProviderRegistryEntry.mockResolvedValue(openAiProvider)
    storeMocks.getSceneRegistryEntry.mockResolvedValue(scene({
      id: 'nexus.intelligence.extract',
      requiredCapabilities: ['content.extract'],
      fallback: 'disabled',
      bindings: [
        {
          ...binding('prv_openai_extract', 'content.extract', 10),
          sceneId: 'nexus.intelligence.extract',
        },
      ],
    }))

    await expect(runSceneOrchestrator(makeEvent(), 'nexus.intelligence.extract', {
      input: { text: 'Extract actions from this text.' },
    })).rejects.toMatchObject({
      statusCode: 502,
      data: {
        code: 'PROVIDER_ADAPTER_FAILED',
        run: expect.objectContaining({
          status: 'failed',
          error: expect.objectContaining({
            message: 'OpenAI-compatible chat returned 401: Incorrect API key provided.',
          }),
          fallbackTrail: expect.arrayContaining([
            expect.objectContaining({
              providerId: 'prv_openai_extract',
              status: 'failed',
              reason: 'OpenAI-compatible chat returned 401: Incorrect API key provided.',
            }),
          ]),
        }),
      },
    })
  })

  it('真实执行但缺少 provider adapter 时返回标准 adapter unavailable 错误', async () => {
    storeMocks.getProviderRegistryEntry.mockResolvedValue(provider({ vendor: 'custom' }))

    await expect(runSceneOrchestrator(makeEvent(), 'corebox.selection.translate', {
      input: { text: 'hello' },
    })).rejects.toMatchObject({
      statusCode: 501,
      data: {
        code: 'PROVIDER_ADAPTER_UNAVAILABLE',
        run: expect.objectContaining({
          status: 'failed',
          error: expect.objectContaining({ code: 'PROVIDER_ADAPTER_UNAVAILABLE' }),
          selected: [],
          fallbackTrail: expect.arrayContaining([
            expect.objectContaining({
              providerId: 'prv_tencent_cloud_mt',
              status: 'failed',
              reason: 'provider_adapter_unavailable',
            }),
          ]),
        }),
      },
    })
    expect(ledgerMocks.recordProviderUsageLedger).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      status: 'failed',
      error: expect.objectContaining({ code: 'PROVIDER_ADAPTER_UNAVAILABLE' }),
    }))
  })

  it('有 adapter 时返回 output、usage 与 trace', async () => {
    registerSceneCapabilityAdapter('tencent-cloud:text.translate', async ({ input, provider, capability }) => ({
      output: {
        translatedText: `translated:${(input as any).text}`,
      },
      providerRequestId: 'req_tencent_1',
      latencyMs: 42,
      usage: [
        {
          unit: 'character',
          quantity: String((input as any).text).length,
          billable: true,
          providerId: provider.id,
          capability,
          estimated: true,
        },
      ],
    }))

    const run = await runSceneOrchestrator(makeEvent(), 'corebox.selection.translate', {
      input: { text: 'hello' },
    })

    expect(run).toMatchObject({
      status: 'completed',
      mode: 'execute',
      output: { translatedText: 'translated:hello' },
      usage: [
        expect.objectContaining({
          unit: 'character',
          quantity: 5,
          providerId: 'prv_tencent_cloud_mt',
          capability: 'text.translate',
        }),
      ],
    })
    expect(run.trace).toEqual(expect.arrayContaining([
      expect.objectContaining({
        phase: 'adapter.dispatch',
        status: 'success',
        metadata: expect.objectContaining({ providerRequestId: 'req_tencent_1', latencyMs: 42 }),
      }),
    ]))
    expect(ledgerMocks.recordProviderUsageLedger).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      runId: run.runId,
      status: 'completed',
      usage: expect.arrayContaining([
        expect.objectContaining({ unit: 'character', quantity: 5 }),
      ]),
    }))
  })

  it('按 scene capability 隔离 Provider quota channel', async () => {
    const quotaEvent = makeEvent()
    const providerId = `prv_quota_channel_${randomUUID()}`
    const multiCapabilityProvider = provider({
      id: providerId,
      name: 'quota-channel-provider',
      displayName: 'Quota Channel Provider',
      capabilities: [
        capability(providerId, 'text.translate', 'character'),
        capability(providerId, 'image.translate', 'image'),
      ],
    })
    storeMocks.getProviderRegistryEntry.mockResolvedValue(multiCapabilityProvider)
    storeMocks.getSceneRegistryEntry.mockResolvedValue(scene({
      id: 'corebox.screenshot.translate',
      displayName: 'CoreBox Screenshot Translate',
      requiredCapabilities: ['image.translate'],
      bindings: [
        {
          ...binding(providerId, 'image.translate', 10),
          sceneId: 'corebox.screenshot.translate',
        },
      ],
    }))
    registerSceneCapabilityAdapter('tencent-cloud:image.translate', async ({ provider, capability }) => ({
      output: {
        translatedImageBase64: 'translated-image',
      },
      usage: [
        {
          unit: 'image',
          quantity: 1,
          billable: true,
          providerId: provider.id,
          capability,
          estimated: true,
        },
      ],
    }))

    await upsertPlatformGovernanceConfig(quotaEvent, {
      configType: 'intelligence_provider_quota',
      name: 'Text translate quota',
      targetId: providerId,
      channel: 'text.translate',
      limits: {
        maxRequests: 1,
        windowDays: 30,
      },
    }, 'admin')
    await upsertPlatformGovernanceConfig(quotaEvent, {
      configType: 'intelligence_provider_quota',
      name: 'Image translate quota',
      targetId: providerId,
      channel: 'image.translate',
      limits: {
        maxRequests: 2,
        windowDays: 30,
      },
    }, 'admin')
    await recordPlatformGovernanceEvent(quotaEvent, {
      scope: 'intelligence',
      action: 'provider.request',
      resourceType: 'provider',
      resourceId: providerId,
      channel: 'text.translate',
      unit: 'request',
      quantity: 1,
    })

    const run = await runSceneOrchestrator(quotaEvent, 'corebox.screenshot.translate', {
      input: {
        imageBase64: 'source-image-base64',
        imageMimeType: 'image/png',
      },
    })
    const events = await listPlatformGovernanceEvents(quotaEvent, {
      scope: 'intelligence',
      resourceType: 'provider',
      resourceId: providerId,
      limit: 20,
    })

    expect(run).toMatchObject({
      status: 'completed',
      output: { translatedImageBase64: 'translated-image' },
    })
    expect(events.filter(item => item.action === 'provider.request' && item.channel === 'image.translate')).toHaveLength(1)
    expect(events.filter(item => item.action === 'provider.request' && item.channel === 'text.translate')).toHaveLength(1)
  })

  it('合并 adapter/upload/assets/constraints 配置并只在 trace 暴露脱敏摘要', async () => {
    const configuredProvider = provider({
      metadata: {
        adapter: {
          mode: 'provider',
          retainedProvider: true,
          apiKey: 'provider-secret',
        },
        upload: {
          storageProvider: 'r2',
          storageChannel: 'provider-channel',
          region: 'ap-shanghai',
        },
        assets: {
          kind: 'provider-asset',
          bucket: 'provider-bucket',
        },
      },
      capabilities: [
        {
          ...textTranslateCapability('prv_tencent_cloud_mt'),
          constraints: {
            maxTokens: 1000,
            timeoutMs: 5000,
            secretKey: 'capability-secret',
          },
          metadata: {
            adapter: {
              mode: 'capability',
              endpointGroup: 'fast',
              authToken: 'capability-token',
            },
            upload: {
              storageChannel: 'capability-channel',
              retryBudget: 1,
            },
            assets: {
              kind: 'capability-asset',
              secretKey: 'asset-secret',
            },
          },
        },
      ],
    })
    storeMocks.getProviderRegistryEntry.mockResolvedValue(configuredProvider)
    storeMocks.getSceneRegistryEntry.mockResolvedValue(scene({
      metadata: {
        adapter: {
          mode: 'scene',
          model: 'scene-model',
          secretKey: 'scene-secret',
        },
        upload: {
          storageProvider: 's3',
        },
        assets: {
          kind: 'scene-asset',
          cachePolicy: 'scene-cache',
        },
      },
      bindings: [
        {
          id: 'binding_text_translate',
          sceneId: 'corebox.selection.translate',
          providerId: 'prv_tencent_cloud_mt',
          capability: 'text.translate',
          priority: 10,
          weight: null,
          status: 'enabled',
          constraints: {
            maxTokens: 800,
            concurrency: 2,
            region: 'cn',
            secretKey: 'binding-secret',
          },
          metadata: {
            adapter: {
              mode: 'binding',
              batchSize: 4,
              apiKey: 'binding-secret',
            },
            upload: {
              storageChannel: 'binding-channel',
              signedUrlTtlSeconds: 60,
            },
            assets: {
              kind: 'binding-asset',
              cachePolicy: 'binding-cache',
            },
          },
          createdAt: '2026-05-10T00:00:00.000Z',
          updatedAt: '2026-05-10T00:00:00.000Z',
        },
      ],
    }))

    const adapter = vi.fn(async ({ adapterConfig }) => ({
      output: { translatedText: 'configured' },
      providerRequestId: 'req_configured',
      latencyMs: 18,
      usage: [{ unit: 'character', quantity: 5, billable: true }],
      adapterConfig,
    }))
    registerSceneCapabilityAdapter('tencent-cloud:text.translate', adapter)

    const run = await runSceneOrchestrator(makeEvent(), 'corebox.selection.translate', {
      input: { text: 'hello' },
    })
    const adapterConfig = adapter.mock.calls[0]?.[0].adapterConfig
    const successTrace = run.trace.find(item =>
      item.phase === 'adapter.dispatch'
      && item.status === 'success'
      && item.metadata?.providerRequestId === 'req_configured',
    )

    expect(adapterConfig).toEqual({
      adapter: {
        mode: 'binding',
        retainedProvider: true,
        apiKey: 'binding-secret',
        endpointGroup: 'fast',
        authToken: 'capability-token',
        model: 'scene-model',
        secretKey: 'scene-secret',
        batchSize: 4,
      },
      upload: {
        storageProvider: 's3',
        storageChannel: 'binding-channel',
        region: 'ap-shanghai',
        retryBudget: 1,
        signedUrlTtlSeconds: 60,
      },
      assets: {
        kind: 'binding-asset',
        bucket: 'provider-bucket',
        secretKey: 'asset-secret',
        cachePolicy: 'binding-cache',
      },
      constraints: {
        maxTokens: 800,
        timeoutMs: 5000,
        secretKey: 'binding-secret',
        concurrency: 2,
        region: 'cn',
      },
      sources: [
        'provider.metadata',
        'capability.metadata',
        'capability.constraints',
        'scene.metadata',
        'binding.metadata',
        'binding.constraints',
      ],
    })
    expect(successTrace?.metadata).toMatchObject({
      providerId: 'prv_tencent_cloud_mt',
      capability: 'text.translate',
      adapterKeys: 'batchSize,endpointGroup,mode,model,retainedProvider',
      uploadKeys: 'region,retryBudget,signedUrlTtlSeconds,storageChannel,storageProvider',
      assetKeys: 'bucket,cachePolicy,kind',
      constraintKeys: 'concurrency,maxTokens,region,timeoutMs',
      storageChannel: 'binding-channel',
      storageProvider: 's3',
      assetKind: 'binding-asset',
      sources: 'provider.metadata,capability.metadata,capability.constraints,scene.metadata,binding.metadata,binding.constraints',
      providerRequestId: 'req_configured',
      latencyMs: 18,
    })
    expect(JSON.stringify(successTrace?.metadata)).not.toContain('apiKey')
    expect(JSON.stringify(successTrace?.metadata)).not.toContain('secretKey')
    expect(JSON.stringify(successTrace?.metadata)).not.toContain('authToken')
    expect(JSON.stringify(successTrace?.metadata)).not.toContain('binding-secret')
    expect(JSON.stringify(successTrace?.metadata)).not.toContain('capability-token')
  })

  it('把显式 Scene adapter 资产写入 storage/upload governance 并替换输出中的原始载荷', async () => {
    const sourceBase64 = Buffer.from('asset-bytes').toString('base64')
    storeMocks.getSceneRegistryEntry.mockResolvedValue(scene({
      metadata: {
        assets: {
          kind: 'translated-image',
          resourceType: 'scene-output-image',
          maxBytes: 128,
        },
      },
    }))

    registerSceneCapabilityAdapter('tencent-cloud:text.translate', async () => ({
      output: {
        translatedImageBase64: sourceBase64,
        sourceText: 'hello',
      },
      providerRequestId: 'req_asset_upload',
      latencyMs: 24,
      usage: [{ unit: 'image', quantity: 1, billable: true }],
      assets: [
        {
          id: 'translated-image',
          outputField: 'translatedImageBase64',
          dataUrl: `data:image/png;base64,${sourceBase64}`,
          fileName: 'translated.png',
          resourceType: 'scene-output-image',
        },
      ],
    }))

    const run = await runSceneOrchestrator(makeEvent(), 'corebox.selection.translate', {
      input: { text: 'hello' },
    })
    const output = run.output as any
    const reference = output.translatedImageBase64
    const governanceResourceId = buildSceneAssetGovernanceResourceId(reference.key)
    const stored = await requireSceneAsset(makeEvent(), reference.key, {
      governanceResourceId,
      resourceType: 'scene-output-image',
    })
    const uploadRows = await listPlatformGovernanceEvents(makeEvent(), {
      scope: 'upload',
      resourceType: 'scene-output-image',
      resourceId: governanceResourceId,
      days: 30,
      limit: 10,
    })
    const storageRows = await listPlatformGovernanceEvents(makeEvent(), {
      scope: 'storage',
      resourceType: 'scene-output-image',
      resourceId: governanceResourceId,
      days: 30,
      limit: 10,
    })
    const successTrace = run.trace.find(item =>
      item.phase === 'adapter.dispatch'
      && item.status === 'success'
      && item.metadata?.providerRequestId === 'req_asset_upload',
    )

    expect(output).toMatchObject({
      sourceText: 'hello',
      translatedImageBase64: {
        type: 'scene-asset',
        id: 'translated-image',
        contentType: 'image/png',
        sha256: 'c092df87ad240efa9f032f792b57f5d3812a833b47de33172f59cf70ee2f01c4',
        size: 11,
        storageChannel: 'memory',
        storageProvider: 'memory',
        resourceType: 'scene-output-image',
      },
      sceneAssets: [
        expect.objectContaining({
          type: 'scene-asset',
          id: 'translated-image',
          sha256: 'c092df87ad240efa9f032f792b57f5d3812a833b47de33172f59cf70ee2f01c4',
          url: expect.stringContaining('/api/v1/scenes/assets/'),
        }),
      ],
    })
    expect(JSON.stringify(run.output)).not.toContain(sourceBase64)
    expect(Buffer.from(stored.data).toString('utf8')).toBe('asset-bytes')
    expect(stored.contentType).toBe('image/png')
    expect(stored.sha256).toBe(reference.sha256)
    expect(successTrace?.metadata).toMatchObject({ uploadedAssets: 1 })
    expect(uploadRows).toEqual(expect.arrayContaining([
      expect.objectContaining({
        action: 'resource.started',
        resourceId: governanceResourceId,
        channel: 'image/png',
        unit: 'file',
        quantity: 1,
      }),
      expect.objectContaining({
        action: 'resource.completed',
        resourceId: governanceResourceId,
        channel: 'image/png',
        unit: 'byte',
        quantity: 11,
        metadata: expect.objectContaining({
          storageChannel: 'memory',
          storageProvider: 'memory',
          surface: 'scene-adapter-upload',
        }),
      }),
    ]))
    expect(storageRows).toEqual(expect.arrayContaining([
      expect.objectContaining({
        action: 'storage.write',
        resourceId: governanceResourceId,
        channel: 'memory',
        unit: 'byte',
        quantity: 11,
      }),
      expect.objectContaining({
        action: 'storage.read',
        resourceId: governanceResourceId,
        channel: 'memory',
        unit: 'byte',
        quantity: 11,
      }),
    ]))
    expect(JSON.stringify(uploadRows)).not.toContain(sourceBase64)
    expect(JSON.stringify(uploadRows)).not.toContain(reference.key)
    expect(JSON.stringify(storageRows)).not.toContain(sourceBase64)
    expect(JSON.stringify(storageRows)).not.toContain(reference.key)
  })

  it('把恢复后的 Scene adapter R2 资产重试写入完成态 upload governance', async () => {
    const bucket = makeBucket(2)
    const event = bucket.event()
    const sourceBase64 = Buffer.from('asset-bytes').toString('base64')
    storeMocks.getSceneRegistryEntry.mockResolvedValue(scene({
      metadata: {
        assets: {
          kind: 'translated-image',
          resourceType: 'scene-output-image',
          maxBytes: 128,
        },
      },
    }))

    registerSceneCapabilityAdapter('tencent-cloud:text.translate', async () => ({
      output: {
        translatedImageBase64: sourceBase64,
      },
      providerRequestId: 'req_asset_r2_recovered',
      assets: [
        {
          id: 'translated-image',
          outputField: 'translatedImageBase64',
          dataUrl: `data:image/png;base64,${sourceBase64}`,
          resourceType: 'scene-output-image',
        },
      ],
    }))

    const run = await runSceneOrchestrator(event, 'corebox.selection.translate', {
      input: { text: 'hello' },
    })
    const reference = (run.output as any).translatedImageBase64
    const governanceResourceId = buildSceneAssetGovernanceResourceId(reference.key)
    const uploadRows = await listPlatformGovernanceEvents(event, {
      scope: 'upload',
      resourceType: 'scene-output-image',
      resourceId: governanceResourceId,
      days: 30,
      limit: 10,
    })
    const completed = uploadRows.find(row => row.action === 'resource.completed')

    expect(bucket.attempts).toBe(3)
    expect(reference).toMatchObject({
      storageChannel: 'r2',
      storageProvider: 'cloudflare-r2',
      resourceType: 'scene-output-image',
      sha256: 'c092df87ad240efa9f032f792b57f5d3812a833b47de33172f59cf70ee2f01c4',
    })
    expect(completed).toMatchObject({
      action: 'resource.completed',
      resourceId: governanceResourceId,
      channel: 'image/png',
      unit: 'byte',
      quantity: 11,
      metadata: expect.objectContaining({
        retryable: true,
        recovered: true,
        retryCount: 2,
        maxRetries: 2,
        attempts: 3,
        nextRetryDelayMs: 0,
        storageChannel: 'r2',
        storageProvider: 'cloudflare-r2',
        storageOperation: 'storage.write',
        storageStatusCode: 503,
        surface: 'scene-adapter-upload',
      }),
    })
    expect(JSON.stringify(uploadRows)).not.toContain(reference.key)
    expect(JSON.stringify(uploadRows)).not.toContain(sourceBase64)
  })

  it('把 Scene adapter 资产 preflight 失败写入 upload governance live sample', async () => {
    const cases = [
      {
        assetId: 'translated-image-invalid-base64',
        rawPayloadMarker: 'invalid-scene-asset-payload-marker!',
        expectedStatusCode: 400,
        asset: {
          id: 'translated-image-invalid-base64',
          outputField: 'translatedImageBase64',
          dataUrl: 'data:image/png;base64,invalid-scene-asset-payload-marker!',
          fileName: 'invalid-base64.png',
          resourceType: 'scene-output-image',
        },
      },
      {
        assetId: 'translated-image-missing-payload',
        rawPayloadMarker: null,
        expectedStatusCode: 400,
        asset: {
          id: 'translated-image-missing-payload',
          outputField: 'translatedImageBase64',
          contentType: 'image/png',
          fileName: 'missing-payload.png',
          resourceType: 'scene-output-image',
        },
      },
      {
        assetId: 'translated-image-too-large',
        rawPayloadMarker: 'oversized-scene-asset-payload',
        expectedStatusCode: 413,
        asset: {
          id: 'translated-image-too-large',
          outputField: 'translatedImageBase64',
          data: Buffer.from('oversized-scene-asset-payload'),
          contentType: 'image/png',
          fileName: 'too-large.png',
          resourceType: 'scene-output-image',
        },
      },
    ]

    storeMocks.getSceneRegistryEntry.mockResolvedValue(scene({
      fallback: 'disabled',
      metadata: {
        assets: {
          kind: 'translated-image',
          resourceType: 'scene-output-image',
          maxBytes: 8,
        },
      },
    }))

    for (const testCase of cases) {
      clearSceneCapabilityAdaptersForTest()
      registerSceneCapabilityAdapter('tencent-cloud:text.translate', async () => ({
        output: { sourceText: 'hello' },
        providerRequestId: `req_asset_preflight_failure_${testCase.assetId}`,
        latencyMs: 19,
        assets: [testCase.asset],
      }))

      await expect(runSceneOrchestrator(makeEvent(), 'corebox.selection.translate', {
        input: { text: 'hello' },
      })).rejects.toMatchObject({
        statusCode: 502,
        data: {
          code: 'PROVIDER_ADAPTER_FAILED',
        },
      })

      const uploadRows = await listPlatformGovernanceEvents(makeEvent(), {
        scope: 'upload',
        resourceType: 'scene-output-image',
        days: 30,
        limit: 100,
      })
      const failedRow = uploadRows.find(row =>
        row.action === 'resource.failed'
        && row.metadata?.surface === 'scene-adapter-upload'
        && row.metadata?.assetId === testCase.assetId,
      )
      expect(failedRow).toEqual(expect.objectContaining({
        action: 'resource.failed',
        resourceType: 'scene-output-image',
        channel: 'image/png',
        unit: 'file',
        quantity: 1,
        metadata: expect.objectContaining({
          surface: 'scene-adapter-upload',
          sceneId: 'corebox.selection.translate',
          providerId: 'prv_tencent_cloud_mt',
          capability: 'text.translate',
          assetId: testCase.assetId,
          assetKind: 'translated-image',
          reason: 'scene-asset-preflight-failed',
          statusCode: testCase.expectedStatusCode,
          failureCategory: 'payload-validation',
          failureSampleSource: 'live',
          failureCalibrationStatus: 'sampled',
          liveFailureSample: true,
          retryable: false,
        }),
      }))

      const startedRow = uploadRows.find(row =>
        row.action === 'resource.started'
        && row.resourceId === failedRow?.resourceId
        && row.metadata?.attemptId === failedRow?.metadata?.attemptId,
      )
      expect(startedRow).toEqual(expect.objectContaining({
        action: 'resource.started',
        resourceType: 'scene-output-image',
        channel: 'image/png',
        unit: 'file',
        quantity: 1,
        metadata: expect.objectContaining({
          surface: 'scene-adapter-upload',
          assetId: testCase.assetId,
        }),
      }))

      const serializedRows = JSON.stringify(uploadRows)
      if (testCase.rawPayloadMarker)
        expect(serializedRows).not.toContain(testCase.rawPayloadMarker)
      expect(serializedRows).not.toContain(testCase.asset.fileName)
      expect(serializedRows).not.toContain('/api/v1/scenes/assets/')
    }

    const analytics = await getPlatformGovernanceAnalytics(makeEvent(), { days: 30, limit: 100, topLimit: 20 })
    const preflight400 = analytics.uploads.failureMatrix.find(item =>
      item.resourceType === 'scene-output-image'
      && item.surface === 'scene-adapter-upload'
      && item.reason === 'scene-asset-preflight-failed'
      && item.statusCode === 400,
    )
    const preflight413 = analytics.uploads.failureMatrix.find(item =>
      item.resourceType === 'scene-output-image'
      && item.surface === 'scene-adapter-upload'
      && item.reason === 'scene-asset-preflight-failed'
      && item.statusCode === 413,
    )

    expect(preflight400).toEqual(expect.objectContaining({
      disposition: 'not-retryable',
      calibrationStatus: 'sampled',
      sampleSource: 'live',
      suggestedAction: 'payload-validation',
    }))
    expect(preflight400?.events).toBeGreaterThanOrEqual(2)
    expect(preflight400?.sampleCount).toBeGreaterThanOrEqual(2)
    expect(preflight413).toEqual(expect.objectContaining({
      disposition: 'not-retryable',
      calibrationStatus: 'sampled',
      sampleSource: 'live',
      sampleCount: 1,
      suggestedAction: 'payload-validation',
    }))

    const serializedMatrix = JSON.stringify(analytics.uploads.failureMatrix)
    expect(serializedMatrix).not.toContain('invalid-scene-asset-payload-marker')
    expect(serializedMatrix).not.toContain('oversized-scene-asset-payload')
  })

  it('adapter 失败且 fallback enabled 时继续尝试下一个候选 provider', async () => {
    const primary = provider({
      id: 'prv_primary',
      name: 'primary',
      displayName: 'Primary Provider',
      capabilities: [textTranslateCapability('prv_primary')],
    })
    const secondary = provider({
      id: 'prv_secondary',
      name: 'secondary',
      displayName: 'Secondary Provider',
      capabilities: [textTranslateCapability('prv_secondary')],
    })
    storeMocks.getSceneRegistryEntry.mockResolvedValue(scene({
      fallback: 'enabled',
      bindings: [
        {
          id: 'binding_primary',
          sceneId: 'corebox.selection.translate',
          providerId: 'prv_primary',
          capability: 'text.translate',
          priority: 10,
          weight: null,
          status: 'enabled',
          constraints: null,
          metadata: null,
          createdAt: '2026-05-10T00:00:00.000Z',
          updatedAt: '2026-05-10T00:00:00.000Z',
        },
        {
          id: 'binding_secondary',
          sceneId: 'corebox.selection.translate',
          providerId: 'prv_secondary',
          capability: 'text.translate',
          priority: 20,
          weight: null,
          status: 'enabled',
          constraints: null,
          metadata: null,
          createdAt: '2026-05-10T00:00:00.000Z',
          updatedAt: '2026-05-10T00:00:00.000Z',
        },
      ],
    }))
    storeMocks.getProviderRegistryEntry.mockImplementation(async (_event, providerId: string) => {
      if (providerId === 'prv_primary')
        return primary
      if (providerId === 'prv_secondary')
        return secondary
      return null
    })

    registerSceneCapabilityAdapter('tencent-cloud:text.translate', async ({ provider }) => {
      if (provider.id === 'prv_primary')
        throw new Error('primary unavailable')
      return {
        output: { translatedText: 'fallback result' },
        providerRequestId: 'req_secondary',
        latencyMs: 64,
        usage: [
          {
            unit: 'character',
            quantity: 5,
            billable: true,
            providerId: provider.id,
            capability: 'text.translate',
            estimated: true,
          },
        ],
      }
    })

    const run = await runSceneOrchestrator(makeEvent(), 'corebox.selection.translate', {
      input: { text: 'hello' },
    })

    expect(run).toMatchObject({
      status: 'completed',
      output: { translatedText: 'fallback result' },
      selected: [
        expect.objectContaining({ providerId: 'prv_secondary' }),
      ],
      fallbackTrail: expect.arrayContaining([
        expect.objectContaining({ providerId: 'prv_primary', status: 'failed', reason: 'primary unavailable' }),
        expect.objectContaining({ providerId: 'prv_secondary', status: 'selected' }),
      ]),
      usage: [
        expect.objectContaining({ providerId: 'prv_secondary', quantity: 5 }),
      ],
    })
  })

  it('adapter 失败且 fallback disabled 时不再尝试下一个候选 provider', async () => {
    const primary = provider({
      id: 'prv_primary',
      name: 'primary',
      displayName: 'Primary Provider',
      capabilities: [textTranslateCapability('prv_primary')],
    })
    const secondary = provider({
      id: 'prv_secondary',
      name: 'secondary',
      displayName: 'Secondary Provider',
      capabilities: [textTranslateCapability('prv_secondary')],
    })
    storeMocks.getSceneRegistryEntry.mockResolvedValue(scene({
      fallback: 'disabled',
      bindings: [
        {
          id: 'binding_primary',
          sceneId: 'corebox.selection.translate',
          providerId: 'prv_primary',
          capability: 'text.translate',
          priority: 10,
          weight: null,
          status: 'enabled',
          constraints: null,
          metadata: null,
          createdAt: '2026-05-10T00:00:00.000Z',
          updatedAt: '2026-05-10T00:00:00.000Z',
        },
        {
          id: 'binding_secondary',
          sceneId: 'corebox.selection.translate',
          providerId: 'prv_secondary',
          capability: 'text.translate',
          priority: 20,
          weight: null,
          status: 'enabled',
          constraints: null,
          metadata: null,
          createdAt: '2026-05-10T00:00:00.000Z',
          updatedAt: '2026-05-10T00:00:00.000Z',
        },
      ],
    }))
    storeMocks.getProviderRegistryEntry.mockImplementation(async (_event, providerId: string) => {
      if (providerId === 'prv_primary')
        return primary
      if (providerId === 'prv_secondary')
        return secondary
      return null
    })
    const adapter = vi.fn(async () => {
      throw new Error('primary unavailable')
    })
    registerSceneCapabilityAdapter('tencent-cloud:text.translate', adapter)

    await expect(runSceneOrchestrator(makeEvent(), 'corebox.selection.translate', {
      input: { text: 'hello' },
    })).rejects.toMatchObject({
      statusCode: 502,
      data: {
        code: 'PROVIDER_ADAPTER_FAILED',
        run: expect.objectContaining({
          status: 'failed',
          selected: [],
          fallbackTrail: expect.arrayContaining([
            expect.objectContaining({ providerId: 'prv_primary', status: 'failed', reason: 'primary unavailable' }),
          ]),
        }),
      },
    })
    expect(adapter).toHaveBeenCalledTimes(1)
  })

  it('least_cost strategy 优先选择 provider capability metering 成本更低的候选', async () => {
    const expensive = provider({
      id: 'prv_expensive',
      name: 'expensive',
      displayName: 'Expensive Provider',
      capabilities: [{
        ...textTranslateCapability('prv_expensive'),
        metering: { unit: 'character', unitCost: 0.8 },
      }],
    })
    const cheap = provider({
      id: 'prv_cheap',
      name: 'cheap',
      displayName: 'Cheap Provider',
      capabilities: [{
        ...textTranslateCapability('prv_cheap'),
        metering: { unit: 'character', unitCost: 0.1 },
      }],
    })
    storeMocks.getSceneRegistryEntry.mockResolvedValue(scene({
      strategyMode: 'least_cost',
      bindings: [
        {
          id: 'binding_expensive',
          sceneId: 'corebox.selection.translate',
          providerId: 'prv_expensive',
          capability: 'text.translate',
          priority: 10,
          weight: null,
          status: 'enabled',
          constraints: null,
          metadata: null,
          createdAt: '2026-05-10T00:00:00.000Z',
          updatedAt: '2026-05-10T00:00:00.000Z',
        },
        {
          id: 'binding_cheap',
          sceneId: 'corebox.selection.translate',
          providerId: 'prv_cheap',
          capability: 'text.translate',
          priority: 20,
          weight: null,
          status: 'enabled',
          constraints: null,
          metadata: null,
          createdAt: '2026-05-10T00:00:00.000Z',
          updatedAt: '2026-05-10T00:00:00.000Z',
        },
      ],
    }))
    storeMocks.getProviderRegistryEntry.mockImplementation(async (_event, providerId: string) => {
      if (providerId === 'prv_expensive')
        return expensive
      if (providerId === 'prv_cheap')
        return cheap
      return null
    })

    const run = await runSceneOrchestrator(makeEvent(), 'corebox.selection.translate', { dryRun: true })

    expect(run.selected[0]).toMatchObject({ providerId: 'prv_cheap' })
    expect(run.trace).toEqual(expect.arrayContaining([
      expect.objectContaining({
        phase: 'strategy.select',
        metadata: expect.objectContaining({ strategyMode: 'least_cost' }),
      }),
    ]))
  })

  it('lowest_latency strategy 使用最新 provider health latency 排序', async () => {
    const slow = provider({
      id: 'prv_slow',
      name: 'slow',
      displayName: 'Slow Provider',
      capabilities: [textTranslateCapability('prv_slow')],
    })
    const fast = provider({
      id: 'prv_fast',
      name: 'fast',
      displayName: 'Fast Provider',
      capabilities: [textTranslateCapability('prv_fast')],
    })
    storeMocks.getSceneRegistryEntry.mockResolvedValue(scene({
      strategyMode: 'lowest_latency',
      bindings: [
        {
          id: 'binding_slow',
          sceneId: 'corebox.selection.translate',
          providerId: 'prv_slow',
          capability: 'text.translate',
          priority: 10,
          weight: null,
          status: 'enabled',
          constraints: null,
          metadata: null,
          createdAt: '2026-05-10T00:00:00.000Z',
          updatedAt: '2026-05-10T00:00:00.000Z',
        },
        {
          id: 'binding_fast',
          sceneId: 'corebox.selection.translate',
          providerId: 'prv_fast',
          capability: 'text.translate',
          priority: 20,
          weight: null,
          status: 'enabled',
          constraints: null,
          metadata: null,
          createdAt: '2026-05-10T00:00:00.000Z',
          updatedAt: '2026-05-10T00:00:00.000Z',
        },
      ],
    }))
    storeMocks.getProviderRegistryEntry.mockImplementation(async (_event, providerId: string) => {
      if (providerId === 'prv_slow')
        return slow
      if (providerId === 'prv_fast')
        return fast
      return null
    })
    healthMocks.getLatestProviderHealthChecks.mockResolvedValue(new Map([
      ['prv_slow', { providerId: 'prv_slow', status: 'healthy', latencyMs: 120 }],
      ['prv_fast', { providerId: 'prv_fast', status: 'healthy', latencyMs: 12 }],
    ]))

    const run = await runSceneOrchestrator(makeEvent(), 'corebox.selection.translate', { dryRun: true })

    expect(healthMocks.getLatestProviderHealthChecks).toHaveBeenCalledWith(expect.anything(), {
      providerIds: ['prv_slow', 'prv_fast'],
      capability: 'text.translate',
    })
    expect(run.selected[0]).toMatchObject({ providerId: 'prv_fast' })
  })

  it('默认腾讯云 text.translate adapter 可执行并返回标准 output/usage', async () => {
    resetSceneCapabilityAdaptersForTest()
    const tencentMocks = await import('./tencentMachineTranslationProvider')
    const spy = vi.spyOn(tencentMocks, 'invokeTencentTextTranslate').mockResolvedValueOnce({
      translatedText: '你好',
      providerRequestId: 'req-tencent-translate',
      latencyMs: 38,
      usage: {
        unit: 'character',
        quantity: 5,
        billable: true,
        estimated: true,
      },
    })

    const run = await runSceneOrchestrator(makeEvent(), 'corebox.selection.translate', {
      input: { text: 'hello', sourceLang: 'en', targetLang: 'zh' },
    })

    expect(spy).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: 'prv_tencent_cloud_mt' }),
      { text: 'hello', sourceLang: 'en', targetLang: 'zh' },
    )
    expect(run).toMatchObject({
      status: 'completed',
      output: { translatedText: '你好' },
      usage: [
        expect.objectContaining({
          unit: 'character',
          quantity: 5,
          providerId: 'prv_tencent_cloud_mt',
          capability: 'text.translate',
        }),
      ],
    })
  })

  it('默认腾讯云 image.translate.e2e adapter 可执行并返回标准 output/usage', async () => {
    resetSceneCapabilityAdaptersForTest()
    const tencentMocks = await import('./tencentMachineTranslationProvider')
    const spy = vi.spyOn(tencentMocks, 'invokeTencentImageTranslate').mockResolvedValueOnce({
      translatedImageBase64: 'translated-image-base64',
      sourceLang: 'auto',
      targetLang: 'zh',
      sourceText: 'hello',
      targetText: '你好',
      angle: 0,
      transDetails: [{ source: 'hello', target: '你好' }],
      providerRequestId: 'req-image-translate',
      latencyMs: 88,
      usage: {
        unit: 'image',
        quantity: 1,
        billable: true,
        estimated: true,
      },
    })
    storeMocks.getSceneRegistryEntry.mockResolvedValue(scene({
      id: 'corebox.screenshot.translate',
      displayName: 'CoreBox Screenshot Translate',
      requiredCapabilities: ['image.translate.e2e'],
      bindings: [
        {
          id: 'binding_image_translate_e2e',
          sceneId: 'corebox.screenshot.translate',
          providerId: 'prv_tencent_cloud_mt',
          capability: 'image.translate.e2e',
          priority: 10,
          weight: null,
          status: 'enabled',
          constraints: null,
          metadata: null,
          createdAt: '2026-05-10T00:00:00.000Z',
          updatedAt: '2026-05-10T00:00:00.000Z',
        },
      ],
    }))
    storeMocks.getProviderRegistryEntry.mockResolvedValue(provider({
      capabilities: [
        {
          ...textTranslateCapability('prv_tencent_cloud_mt'),
          id: 'cap_image_translate_e2e',
          capability: 'image.translate.e2e',
          metering: { unit: 'image' },
        },
      ],
    }))

    const run = await runSceneOrchestrator(makeEvent(), 'corebox.screenshot.translate', {
      input: { imageBase64: 'source-image-base64', targetLang: 'zh' },
    })

    expect(spy).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: 'prv_tencent_cloud_mt' }),
      { data: undefined, imageBase64: 'source-image-base64', url: undefined, imageUrl: undefined, targetLang: 'zh' },
      'image.translate.e2e',
    )
    expect(run).toMatchObject({
      status: 'completed',
      output: {
        translatedImageBase64: 'translated-image-base64',
        sourceLang: 'auto',
        targetLang: 'zh',
        sourceText: 'hello',
        targetText: '你好',
      },
      usage: [
        expect.objectContaining({
          unit: 'image',
          quantity: 1,
          providerId: 'prv_tencent_cloud_mt',
          capability: 'image.translate.e2e',
        }),
      ],
    })
  })

  it('默认 exchange-rate fx.rate.latest adapter 可通过 Scene 返回汇率快照与 usage', async () => {
    resetSceneCapabilityAdaptersForTest()
    fxMocks.getUsdRates.mockResolvedValueOnce({
      source: 'cache',
      snapshot: {
        id: 'fx-snapshot-1',
        baseCurrency: 'USD',
        fetchedAt: Date.parse('2026-05-10T00:00:00.000Z'),
        providerUpdatedAt: Date.parse('2026-05-09T00:00:00.000Z'),
        providerNextUpdateAt: Date.parse('2026-05-11T00:00:00.000Z'),
        payload: { result: 'success' },
        rates: { USD: 1, CNY: 7.1 },
      },
    })
    storeMocks.getSceneRegistryEntry.mockResolvedValue(scene({
      id: 'corebox.fx.latest',
      displayName: 'CoreBox FX Latest',
      requiredCapabilities: ['fx.rate.latest'],
      bindings: [
        {
          id: 'binding_fx_latest',
          sceneId: 'corebox.fx.latest',
          providerId: 'prv_fx_official',
          capability: 'fx.rate.latest',
          priority: 10,
          weight: null,
          status: 'enabled',
          constraints: null,
          metadata: null,
          createdAt: '2026-05-10T00:00:00.000Z',
          updatedAt: '2026-05-10T00:00:00.000Z',
        },
      ],
    }))
    storeMocks.getProviderRegistryEntry.mockResolvedValue(provider({
      id: 'prv_fx_official',
      name: 'exchange-rate-official',
      displayName: 'Exchange Rate Official',
      vendor: 'exchange-rate',
      authType: 'api_key',
      authRef: 'secure://providers/exchange-rate-official',
      endpoint: 'https://v6.exchangerate-api.com/v6',
      region: null,
      capabilities: [fxCapability('prv_fx_official', 'fx.rate.latest')],
    }))

    const run = await runSceneOrchestrator(makeEvent(), 'corebox.fx.latest', {})

    expect(fxMocks.getUsdRates).toHaveBeenCalledWith(expect.anything())
    expect(run).toMatchObject({
      status: 'completed',
      output: {
        base: 'USD',
        asOf: '2026-05-09T00:00:00.000Z',
        source: 'cache',
        rates: { USD: 1, CNY: 7.1 },
      },
      usage: [
        expect.objectContaining({
          unit: 'fx_quote',
          quantity: 1,
          providerId: 'prv_fx_official',
          capability: 'fx.rate.latest',
          estimated: true,
        }),
      ],
    })
  })

  it('默认 exchange-rate fx.convert adapter 可通过 Scene 返回换算结果与 usage', async () => {
    resetSceneCapabilityAdaptersForTest()
    fxMocks.convertUsd.mockResolvedValueOnce({
      rate: 7.1,
      converted: 71,
      source: 'live',
      updatedAt: '2026-05-10T00:00:00.000Z',
      providerUpdatedAt: '2026-05-10T00:00:00.000Z',
      fetchedAt: '2026-05-10T00:00:00.000Z',
      providerNextUpdateAt: '2026-05-11T00:00:00.000Z',
    })
    storeMocks.getSceneRegistryEntry.mockResolvedValue(scene({
      id: 'corebox.fx.convert',
      displayName: 'CoreBox FX Convert',
      requiredCapabilities: ['fx.convert'],
      bindings: [
        {
          id: 'binding_fx_convert',
          sceneId: 'corebox.fx.convert',
          providerId: 'prv_fx_official',
          capability: 'fx.convert',
          priority: 10,
          weight: null,
          status: 'enabled',
          constraints: null,
          metadata: null,
          createdAt: '2026-05-10T00:00:00.000Z',
          updatedAt: '2026-05-10T00:00:00.000Z',
        },
      ],
    }))
    storeMocks.getProviderRegistryEntry.mockResolvedValue(provider({
      id: 'prv_fx_official',
      name: 'exchange-rate-official',
      displayName: 'Exchange Rate Official',
      vendor: 'exchange-rate',
      authType: 'api_key',
      authRef: 'secure://providers/exchange-rate-official',
      endpoint: 'https://v6.exchangerate-api.com/v6',
      region: null,
      capabilities: [fxCapability('prv_fx_official', 'fx.convert')],
    }))

    const run = await runSceneOrchestrator(makeEvent(), 'corebox.fx.convert', {
      input: { base: 'USD', target: 'CNY', amount: 10 },
    })

    expect(fxMocks.convertUsd).toHaveBeenCalledWith(expect.anything(), {
      target: 'CNY',
      amount: 10,
    })
    expect(run).toMatchObject({
      status: 'completed',
      output: {
        base: 'USD',
        target: 'CNY',
        amount: 10,
        rate: 7.1,
        converted: 71,
        source: 'live',
      },
      usage: [
        expect.objectContaining({
          unit: 'fx_quote',
          quantity: 1,
          providerId: 'prv_fx_official',
          capability: 'fx.convert',
          estimated: false,
        }),
      ],
    })
  })

  it('composed 截图翻译按 capability 链传递 OCR、翻译与 overlay 输入', async () => {
    resetSceneCapabilityAdaptersForTest()
    intelligenceOcrMocks.invokeIntelligenceVisionOcr.mockResolvedValueOnce({
      output: {
        text: 'hello',
        language: 'en',
        blocks: [{ text: 'hello', boundingBox: [1, 2, 3, 4] }],
      },
      providerRequestId: 'req-ocr-1',
      latencyMs: 57,
      usage: { unit: 'image', quantity: 1, billable: true, estimated: true },
    })
    const visionProvider = provider({
      id: 'prv_vision',
      name: 'vision',
      displayName: 'Vision Provider',
      vendor: 'custom',
      authType: 'api_key',
      authRef: 'secure://providers/intelligence-vision',
      metadata: {
        source: 'intelligence',
        intelligenceProviderId: 'ip_vision',
        intelligenceType: 'openai',
        defaultModel: 'gpt-4.1-mini',
      },
      capabilities: [capability('prv_vision', 'vision.ocr', 'image')],
    })
    const translateProvider = provider({
      id: 'prv_translate',
      name: 'translate',
      displayName: 'Translate Provider',
      capabilities: [textTranslateCapability('prv_translate')],
    })
    const overlayProvider = provider({
      id: 'prv_local_overlay',
      name: 'local-overlay',
      displayName: 'Local Overlay',
      vendor: 'custom',
      authType: 'none',
      authRef: null,
      capabilities: [capability('prv_local_overlay', 'overlay.render', 'image')],
    })
    storeMocks.getSceneRegistryEntry.mockResolvedValue(scene({
      id: 'corebox.screenshot.translate',
      displayName: 'CoreBox Screenshot Translate',
      requiredCapabilities: ['vision.ocr', 'text.translate', 'overlay.render'],
      bindings: [
        binding('prv_vision', 'vision.ocr', 10),
        binding('prv_translate', 'text.translate', 20),
        binding('prv_local_overlay', 'overlay.render', 30),
      ],
    }))
    storeMocks.getProviderRegistryEntry.mockImplementation(async (_event, providerId: string) => {
      if (providerId === 'prv_vision')
        return visionProvider
      if (providerId === 'prv_translate')
        return translateProvider
      if (providerId === 'prv_local_overlay')
        return overlayProvider
      return null
    })

    const observedInputs: Record<string, unknown> = {}
    registerSceneCapabilityAdapter('tencent-cloud:text.translate', async ({ input, outputs }) => {
      observedInputs['text.translate'] = input
      expect((input as any).text).toBe('hello')
      expect(outputs['vision.ocr']).toMatchObject({ text: 'hello' })
      return {
        output: { translatedText: '你好' },
        usage: [{ unit: 'character', quantity: 5, billable: true }],
      }
    })

    const run = await runSceneOrchestrator(makeEvent(), 'corebox.screenshot.translate', {
      input: { imageBase64: 'source-image-base64', targetLang: 'zh' },
    })

    expect(intelligenceOcrMocks.invokeIntelligenceVisionOcr).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: 'prv_vision' }),
      expect.objectContaining({
        source: { type: 'data-url', dataUrl: 'data:image/png;base64,source-image-base64' },
        includeLayout: true,
        includeKeywords: true,
      }),
    )
    expect(run).toMatchObject({
      status: 'completed',
      selected: [
        expect.objectContaining({ providerId: 'prv_vision', capability: 'vision.ocr' }),
        expect.objectContaining({ providerId: 'prv_translate', capability: 'text.translate' }),
        expect.objectContaining({ providerId: 'prv_local_overlay', capability: 'overlay.render' }),
      ],
      output: {
        'vision.ocr': expect.objectContaining({ text: 'hello' }),
        'text.translate': expect.objectContaining({ translatedText: '你好' }),
        'overlay.render': expect.objectContaining({
          translatedImageBase64: 'source-image-base64',
          sourceText: 'hello',
          targetText: '你好',
          overlay: expect.objectContaining({ mode: 'client-render' }),
        }),
      },
      usage: [
        expect.objectContaining({ unit: 'image', billable: true, providerId: 'prv_vision' }),
        expect.objectContaining({ unit: 'character' }),
        expect.objectContaining({ unit: 'image', billable: false, providerId: 'prv_local_overlay' }),
      ],
    })
    expect(observedInputs['text.translate']).toMatchObject({
      text: 'hello',
      sourceLang: 'en',
    })
  })

  it('composed 图片输入只把 data URL 当作可本地传递的 image url', async () => {
    const visionProvider = provider({
      id: 'prv_vision',
      name: 'vision',
      displayName: 'Vision Provider',
      vendor: 'custom',
      authType: 'none',
      authRef: null,
      capabilities: [capability('prv_vision', 'vision.ocr', 'image')],
    })
    storeMocks.getSceneRegistryEntry.mockResolvedValue(scene({
      id: 'corebox.screenshot.translate',
      displayName: 'CoreBox Screenshot Translate',
      requiredCapabilities: ['vision.ocr'],
      bindings: [binding('prv_vision', 'vision.ocr', 10)],
    }))
    storeMocks.getProviderRegistryEntry.mockResolvedValue(visionProvider)

    const observedInputs: unknown[] = []
    registerSceneCapabilityAdapter('custom:vision.ocr', async ({ input }) => {
      observedInputs.push(input)
      return {
        output: { text: 'hello' },
        usage: [{ unit: 'image', quantity: 1, billable: false }],
      }
    })

    await runSceneOrchestrator(makeEvent(), 'corebox.screenshot.translate', {
      input: { imageUrl: 'https://example.invalid/source.png', targetLang: 'zh' },
    })
    await runSceneOrchestrator(makeEvent(), 'corebox.screenshot.translate', {
      input: { imageUrl: 'data:image/jpeg;base64,abc123', targetLang: 'zh' },
    })

    expect(observedInputs[0]).toMatchObject({
      imageUrl: 'https://example.invalid/source.png',
      source: undefined,
    })
    expect(observedInputs[1]).toMatchObject({
      source: { type: 'data-url', dataUrl: 'data:image/jpeg;base64,abc123' },
    })
  })

  it('默认 local overlay.render adapter 返回客户端 overlay payload', async () => {
    resetSceneCapabilityAdaptersForTest()
    const overlayProvider = provider({
      id: 'prv_local_overlay',
      name: 'local-overlay',
      displayName: 'Local Overlay',
      vendor: 'custom',
      authType: 'none',
      authRef: null,
      capabilities: [capability('prv_local_overlay', 'overlay.render', 'image')],
    })
    storeMocks.getSceneRegistryEntry.mockResolvedValue(scene({
      id: 'image.translate.pin',
      displayName: 'Image Translate Pin',
      requiredCapabilities: ['overlay.render'],
      bindings: [
        {
          ...binding('prv_local_overlay', 'overlay.render', 10),
          sceneId: 'image.translate.pin',
        },
      ],
    }))
    storeMocks.getProviderRegistryEntry.mockResolvedValue(overlayProvider)

    const run = await runSceneOrchestrator(makeEvent(), 'image.translate.pin', {
      input: {
        imageBase64: 'source-image-base64',
        imageMimeType: 'image/png',
        targetText: '你好',
        sourceText: 'hello',
      },
    })

    expect(run).toMatchObject({
      status: 'completed',
      output: {
        translatedImageBase64: 'source-image-base64',
        imageMimeType: 'image/png',
        sourceText: 'hello',
        targetText: '你好',
        overlay: {
          mode: 'client-render',
          sourceCapability: 'overlay.render',
        },
      },
      usage: [
        expect.objectContaining({
          unit: 'image',
          billable: false,
          providerId: 'prv_local_overlay',
          capability: 'overlay.render',
        }),
      ],
    })
  })

  it('scene disabled 时拒绝执行', async () => {
    storeMocks.getSceneRegistryEntry.mockResolvedValue(scene({ status: 'disabled' }))

    await expect(runSceneOrchestrator(makeEvent(), 'corebox.selection.translate', {
      dryRun: true,
    })).rejects.toMatchObject({
      statusCode: 409,
      data: {
        code: 'SCENE_DISABLED',
        run: expect.objectContaining({
          status: 'failed',
          error: expect.objectContaining({ code: 'SCENE_DISABLED' }),
        }),
      },
    })
  })

  it('provider 没有声明 scene 所需 capability 时返回 unsupported', async () => {
    storeMocks.getProviderRegistryEntry.mockResolvedValue(provider({ capabilities: [] }))

    await expect(runSceneOrchestrator(makeEvent(), 'corebox.selection.translate', {
      dryRun: true,
    })).rejects.toMatchObject({
      statusCode: 409,
      data: {
        code: 'CAPABILITY_UNSUPPORTED',
        run: expect.objectContaining({
          fallbackTrail: [
            expect.objectContaining({
              providerId: 'prv_tencent_cloud_mt',
              status: 'rejected',
              reason: 'provider_capability_missing',
            }),
          ],
        }),
      },
    })
  })
})
