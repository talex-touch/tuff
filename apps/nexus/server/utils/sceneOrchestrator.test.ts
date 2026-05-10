import type { ProviderRegistryRecord } from './providerRegistryStore'
import type { SceneRegistryRecord } from './sceneRegistryStore'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearSceneCapabilityAdaptersForTest,
  registerSceneCapabilityAdapter,
  runSceneOrchestrator,
} from './sceneOrchestrator'

const storeMocks = vi.hoisted(() => ({
  getProviderRegistryEntry: vi.fn(),
  getSceneRegistryEntry: vi.fn(),
}))

vi.mock('./providerRegistryStore', () => ({
  getProviderRegistryEntry: storeMocks.getProviderRegistryEntry,
}))

vi.mock('./sceneRegistryStore', () => ({
  getSceneRegistryEntry: storeMocks.getSceneRegistryEntry,
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
  })

  it('真实执行但缺少 provider adapter 时返回标准 adapter unavailable 错误', async () => {
    await expect(runSceneOrchestrator(makeEvent(), 'corebox.selection.translate', {
      input: { text: 'hello' },
    })).rejects.toMatchObject({
      statusCode: 501,
      data: {
        code: 'PROVIDER_ADAPTER_UNAVAILABLE',
        run: expect.objectContaining({
          status: 'failed',
          error: expect.objectContaining({ code: 'PROVIDER_ADAPTER_UNAVAILABLE' }),
          selected: [
            expect.objectContaining({ providerId: 'prv_tencent_cloud_mt' }),
          ],
        }),
      },
    })
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
