import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getPilotAdminRoutingConfig } from '../pilot-admin-routing-config'
import { getPilotChannelCatalog, resolvePilotChannelSelection } from '../pilot-channel'
import { resolvePilotRoutingSelection } from '../pilot-routing-resolver'

vi.mock('../pilot-admin-routing-config', async (importOriginal) => {
  const original = await importOriginal<typeof import('../pilot-admin-routing-config')>()
  return {
    ...original,
    getPilotAdminRoutingConfig: vi.fn(),
  }
})

vi.mock('../pilot-channel', () => ({
  getPilotChannelCatalog: vi.fn(),
  resolvePilotChannelSelection: vi.fn(),
}))

vi.mock('../pilot-channel-scorer', () => ({
  computeChannelModelStats: vi.fn().mockResolvedValue(new Map()),
}))

vi.mock('../pilot-route-health', () => ({
  buildRouteKey: (channelId: string, providerModel: string) => `${channelId}::${providerModel}`,
  isRouteHealthy: vi.fn().mockReturnValue({
    healthy: true,
    state: 'closed',
  }),
}))
describe('pilot-routing-resolver intent routing', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    vi.mocked(getPilotChannelCatalog).mockResolvedValue({
      defaultChannelId: 'ch1',
      channels: [
        {
          id: 'ch1',
          name: 'channel-1',
          baseUrl: 'https://api.openai.com',
          apiKey: 'key',
          model: 'chat-model',
          adapter: 'openai',
          transport: 'responses',
          timeoutMs: 30_000,
          builtinTools: ['write_todos'],
          enabled: true,
          models: [
            { id: 'chat-model', enabled: true },
            { id: 'nano-model', enabled: true },
            { id: 'image-model', enabled: true },
          ],
        },
      ],
    } as any)

    vi.mocked(resolvePilotChannelSelection).mockResolvedValue({
      channelId: 'ch1',
      adapter: 'openai',
      transport: 'responses',
      channel: {
        id: 'ch1',
        name: 'channel-1',
        baseUrl: 'https://api.openai.com',
        apiKey: 'key',
        model: 'chat-model',
        defaultModelId: 'chat-model',
        adapter: 'openai',
        transport: 'responses',
        timeoutMs: 30_000,
        builtinTools: ['write_todos'],
        enabled: true,
      },
    } as any)

    vi.mocked(getPilotAdminRoutingConfig).mockResolvedValue({
      modelCatalog: [
        {
          id: 'chat-model',
          name: 'chat-model',
          enabled: true,
          visible: true,
          source: 'manual',
          allowWebsearch: true,
          allowImageGeneration: false,
          bindings: [
            { channelId: 'ch1', providerModel: 'chat-model', enabled: true, priority: 100, weight: 100 },
          ],
        },
        {
          id: 'nano-model',
          name: 'nano-model',
          enabled: true,
          visible: true,
          source: 'manual',
          allowWebsearch: true,
          allowImageGeneration: true,
          bindings: [
            { channelId: 'ch1', providerModel: 'nano-model', enabled: true, priority: 100, weight: 100 },
          ],
        },
        {
          id: 'image-model',
          name: 'image-model',
          enabled: true,
          visible: true,
          source: 'manual',
          allowWebsearch: true,
          allowImageGeneration: true,
          bindings: [
            { channelId: 'ch1', providerModel: 'image-model', enabled: true, priority: 100, weight: 100 },
          ],
        },
      ],
      routeCombos: [
        {
          id: 'intent-combo',
          name: 'intent-combo',
          enabled: true,
          routes: [
            { channelId: 'ch1', providerModel: 'nano-model', enabled: true, priority: 1, weight: 100 },
          ],
        },
        {
          id: 'image-combo',
          name: 'image-combo',
          enabled: true,
          routes: [
            { channelId: 'ch1', providerModel: 'image-model', enabled: true, priority: 1, weight: 100 },
          ],
        },
      ],
      routingPolicy: {
        defaultModelId: 'chat-model',
        defaultRouteComboId: 'default-auto',
        quotaAutoStrategy: 'speed-first',
        explorationRate: 0,
        intentNanoModelId: 'nano-model',
        intentRouteComboId: 'intent-combo',
        imageGenerationModelId: 'image-model',
        imageRouteComboId: 'image-combo',
      },
      lbPolicy: {
        metricWindowHours: 24,
        recentRequestWindow: 200,
        circuitBreakerFailureThreshold: 3,
        circuitBreakerCooldownMs: 60_000,
        halfOpenProbeCount: 1,
      },
      memoryPolicy: {
        enabledByDefault: true,
        allowUserDisable: true,
        allowUserClear: true,
      },
    } as any)
  })

  it('prefers intent nano route for intent_classification', async () => {
    const result = await resolvePilotRoutingSelection({} as any, {
      requestedModelId: 'chat-model',
      intentType: 'intent_classification',
    })

    expect(result.providerModel).toBe('nano-model')
    expect(result.routeComboId).toBe('intent-combo')
    expect(result.intentType).toBe('intent_classification')
  })

  it('uses image route for image_generate intent', async () => {
    const result = await resolvePilotRoutingSelection({} as any, {
      requestedModelId: 'chat-model',
      intentType: 'image_generate',
    })

    expect(result.providerModel).toBe('image-model')
    expect(result.routeComboId).toBe('image-combo')
    expect(result.intentType).toBe('image_generate')
  })

  it('prioritizes model-group builtinTools over channel config', async () => {
    vi.mocked(getPilotAdminRoutingConfig).mockResolvedValueOnce({
      modelCatalog: [
        {
          id: 'chat-model',
          name: 'chat-model',
          enabled: true,
          visible: true,
          source: 'manual',
          allowWebsearch: true,
          allowImageGeneration: false,
          builtinTools: ['read_file'],
          bindings: [
            { channelId: 'ch1', providerModel: 'chat-model', enabled: true, priority: 100, weight: 100 },
          ],
        },
      ],
      routeCombos: [],
      routingPolicy: {
        defaultModelId: 'chat-model',
        defaultRouteComboId: 'default-auto',
        quotaAutoStrategy: 'speed-first',
        explorationRate: 0,
        intentNanoModelId: '',
        intentRouteComboId: '',
        imageGenerationModelId: '',
        imageRouteComboId: '',
      },
      lbPolicy: {
        metricWindowHours: 24,
        recentRequestWindow: 200,
        circuitBreakerFailureThreshold: 3,
        circuitBreakerCooldownMs: 60_000,
        halfOpenProbeCount: 1,
      },
      memoryPolicy: {
        enabledByDefault: true,
        allowUserDisable: true,
        allowUserClear: true,
      },
    } as any)

    const result = await resolvePilotRoutingSelection({} as any, {
      requestedModelId: 'chat-model',
      intentType: 'chat',
      internet: true,
    })

    expect(result.builtinTools).toContain('read_file')
    expect(result.builtinTools).toContain('websearch')
    expect(result.builtinTools).not.toContain('write_todos')
  })

  it('respects channel model priority in quota-auto mode', async () => {
    vi.mocked(getPilotChannelCatalog).mockResolvedValue({
      defaultChannelId: 'ch1',
      channels: [
        {
          id: 'ch1',
          name: 'channel-1',
          baseUrl: 'https://api.openai.com',
          apiKey: 'key',
          model: 'chat-model',
          adapter: 'openai',
          transport: 'responses',
          timeoutMs: 30_000,
          builtinTools: ['write_todos'],
          enabled: true,
          models: [
            { id: 'chat-model', enabled: true, priority: 200 },
            { id: 'nano-model', enabled: true, priority: 5 },
          ],
        },
      ],
    } as any)

    const result = await resolvePilotRoutingSelection({} as any, {
      requestedModelId: 'quota-auto',
      intentType: 'chat',
    })

    expect(result.selectionSource).toBe('quota-auto')
    expect(result.providerModel).toBe('nano-model')
  })

  it('skips disabled providerModel in route-combo and selects enabled route', async () => {
    vi.mocked(getPilotChannelCatalog).mockResolvedValueOnce({
      defaultChannelId: 'ch1',
      channels: [
        {
          id: 'ch1',
          name: 'channel-1',
          baseUrl: 'https://api.openai.com',
          apiKey: 'key',
          model: 'chat-model',
          defaultModelId: 'chat-model',
          adapter: 'openai',
          transport: 'responses',
          timeoutMs: 30_000,
          builtinTools: ['write_todos'],
          enabled: true,
          models: [
            { id: 'chat-model', enabled: true, priority: 20 },
            { id: 'closed-model', enabled: false, priority: 1 },
          ],
        },
      ],
    } as any)

    vi.mocked(getPilotAdminRoutingConfig).mockResolvedValueOnce({
      modelCatalog: [
        {
          id: 'chat-model',
          name: 'chat-model',
          enabled: true,
          visible: true,
          source: 'manual',
          allowWebsearch: true,
          allowImageGeneration: false,
          bindings: [
            { channelId: 'ch1', providerModel: 'chat-model', enabled: true, priority: 20, weight: 100 },
          ],
        },
        {
          id: 'closed-model',
          name: 'closed-model',
          enabled: true,
          visible: true,
          source: 'manual',
          allowWebsearch: true,
          allowImageGeneration: false,
          bindings: [
            { channelId: 'ch1', providerModel: 'closed-model', enabled: true, priority: 1, weight: 100 },
          ],
        },
      ],
      routeCombos: [
        {
          id: 'default-auto',
          name: 'default-auto',
          enabled: true,
          routes: [
            { channelId: 'ch1', providerModel: 'closed-model', enabled: true, priority: 1, weight: 100 },
            { channelId: 'ch1', providerModel: 'chat-model', enabled: true, priority: 2, weight: 100 },
          ],
        },
      ],
      routingPolicy: {
        defaultModelId: 'chat-model',
        defaultRouteComboId: 'default-auto',
        quotaAutoStrategy: 'speed-first',
        explorationRate: 0,
        intentNanoModelId: '',
        intentRouteComboId: '',
        imageGenerationModelId: '',
        imageRouteComboId: '',
      },
      lbPolicy: {
        metricWindowHours: 24,
        recentRequestWindow: 200,
        circuitBreakerFailureThreshold: 3,
        circuitBreakerCooldownMs: 60_000,
        halfOpenProbeCount: 1,
      },
      memoryPolicy: {
        enabledByDefault: true,
        allowUserDisable: true,
        allowUserClear: true,
      },
    } as any)

    const result = await resolvePilotRoutingSelection({} as any, {
      requestedModelId: 'chat-model',
      intentType: 'chat',
    })

    expect(result.selectionSource).toBe('route-combo')
    expect(result.providerModel).toBe('chat-model')
  })

  it('requiredCapability 命中时会跳过不支持能力的模型并回退到可用模型', async () => {
    vi.mocked(getPilotAdminRoutingConfig).mockResolvedValueOnce({
      modelCatalog: [
        {
          id: 'chat-model',
          name: 'chat-model',
          enabled: true,
          visible: true,
          source: 'manual',
          capabilities: {
            websearch: true,
            'file.analyze': true,
            'image.generate': true,
            'image.edit': true,
            'audio.tts': false,
            'audio.stt': true,
            'audio.transcribe': true,
            'video.generate': true,
          },
          allowWebsearch: true,
          allowImageGeneration: true,
          bindings: [
            { channelId: 'ch1', providerModel: 'chat-model', enabled: true, priority: 10, weight: 100 },
          ],
        },
        {
          id: 'nano-model',
          name: 'nano-model',
          enabled: true,
          visible: true,
          source: 'manual',
          allowWebsearch: true,
          allowImageGeneration: true,
          bindings: [
            { channelId: 'ch1', providerModel: 'nano-model', enabled: true, priority: 20, weight: 100 },
          ],
        },
      ],
      routeCombos: [],
      routingPolicy: {
        defaultModelId: 'chat-model',
        defaultRouteComboId: 'default-auto',
        quotaAutoStrategy: 'speed-first',
        explorationRate: 0,
        intentNanoModelId: '',
        intentRouteComboId: '',
        imageGenerationModelId: '',
        imageRouteComboId: '',
      },
      lbPolicy: {
        metricWindowHours: 24,
        recentRequestWindow: 200,
        circuitBreakerFailureThreshold: 3,
        circuitBreakerCooldownMs: 60_000,
        halfOpenProbeCount: 1,
      },
      memoryPolicy: {
        enabledByDefault: true,
        allowUserDisable: true,
        allowUserClear: true,
      },
    } as any)

    const result = await resolvePilotRoutingSelection({} as any, {
      requestedModelId: 'chat-model',
      intentType: 'chat',
      requiredCapability: 'audio.tts',
    })

    expect(result.providerModel).toBe('nano-model')
    expect(result.requiredCapability).toBe('audio.tts')
  })

  it('excludeRouteKeys 生效时会跳过已失败 route', async () => {
    const result = await resolvePilotRoutingSelection({} as any, {
      requestedModelId: 'quota-auto',
      intentType: 'image_generate',
      requiredCapability: 'image.generate',
      excludeRouteKeys: ['ch1::nano-model'],
    })

    expect(result.routeKey).toBe('ch1::image-model')
    expect(result.providerModel).toBe('image-model')
  })
})
