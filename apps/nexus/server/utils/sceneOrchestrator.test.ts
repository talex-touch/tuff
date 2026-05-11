import type { ProviderRegistryRecord } from './providerRegistryStore'
import type { SceneRegistryRecord } from './sceneRegistryStore'
import { beforeEach, describe, expect, it, vi } from 'vitest'
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

describe('runSceneOrchestrator', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearSceneCapabilityAdaptersForTest()
    storeMocks.getSceneRegistryEntry.mockResolvedValue(scene())
    storeMocks.getProviderRegistryEntry.mockResolvedValue(provider())
    ledgerMocks.recordProviderUsageLedger.mockResolvedValue([])
    healthMocks.getLatestProviderHealthChecks.mockResolvedValue(new Map())
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
