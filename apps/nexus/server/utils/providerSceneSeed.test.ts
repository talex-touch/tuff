import type { ProviderRegistryRecord } from './providerRegistryStore'
import type { SceneRegistryRecord } from './sceneRegistryStore'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ensureDefaultProviderSceneSeed } from './providerSceneSeed'

const storeMocks = vi.hoisted(() => ({
  listProviderRegistryEntries: vi.fn(),
  createProviderRegistryEntry: vi.fn(),
  getSceneRegistryEntry: vi.fn(),
  createSceneRegistryEntry: vi.fn(),
  updateSceneRegistryEntry: vi.fn(),
}))

vi.mock('./providerRegistryStore', () => ({
  createProviderRegistryEntry: storeMocks.createProviderRegistryEntry,
  listProviderRegistryEntries: storeMocks.listProviderRegistryEntries,
}))

vi.mock('./sceneRegistryStore', () => ({
  createSceneRegistryEntry: storeMocks.createSceneRegistryEntry,
  getSceneRegistryEntry: storeMocks.getSceneRegistryEntry,
  updateSceneRegistryEntry: storeMocks.updateSceneRegistryEntry,
}))

const event = {} as any

function provider(
  id: string,
  capability: string,
  overrides: Partial<ProviderRegistryRecord> = {},
): ProviderRegistryRecord {
  return {
    id,
    name: id,
    displayName: id,
    vendor: 'custom',
    status: 'enabled',
    authType: 'none',
    authRef: null,
    ownerScope: 'system',
    ownerId: null,
    description: null,
    endpoint: null,
    region: null,
    metadata: null,
    capabilities: [
      {
        id: `${id}:${capability}`,
        providerId: id,
        capability,
        schemaRef: null,
        metering: null,
        constraints: null,
        metadata: null,
        createdAt: '2026-05-11T00:00:00.000Z',
        updatedAt: '2026-05-11T00:00:00.000Z',
      },
    ],
    createdBy: 'admin_1',
    createdAt: '2026-05-11T00:00:00.000Z',
    updatedAt: '2026-05-11T00:00:00.000Z',
    ...overrides,
  }
}

function scene(overrides: Partial<SceneRegistryRecord> = {}): SceneRegistryRecord {
  return {
    id: 'corebox.screenshot.translate',
    displayName: 'Custom Screenshot Translate',
    owner: 'core-app',
    ownerScope: 'system',
    ownerId: null,
    status: 'enabled',
    requiredCapabilities: ['image.translate.e2e'],
    strategyMode: 'manual',
    fallback: 'disabled',
    meteringPolicy: null,
    auditPolicy: { persistInput: false },
    metadata: { owner: 'admin-custom' },
    bindings: [
      {
        id: 'binding_existing',
        sceneId: 'corebox.screenshot.translate',
        providerId: 'prv_existing_image',
        capability: 'image.translate.e2e',
        priority: 5,
        weight: null,
        status: 'enabled',
        constraints: { maxImageBytes: 1024 },
        metadata: { route: 'admin' },
        createdAt: '2026-05-11T00:00:00.000Z',
        updatedAt: '2026-05-11T00:00:00.000Z',
      },
    ],
    createdBy: 'admin_1',
    createdAt: '2026-05-11T00:00:00.000Z',
    updatedAt: '2026-05-11T00:00:00.000Z',
    ...overrides,
  }
}

describe('providerSceneSeed', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    storeMocks.createProviderRegistryEntry.mockImplementation(async (_event, input) => ({
      ...provider('prv_overlay', 'overlay.render'),
      name: input.name,
      displayName: input.displayName,
      vendor: input.vendor,
      metadata: input.metadata,
      capabilities: [
        {
          ...provider('prv_overlay', 'overlay.render').capabilities[0],
          ...input.capabilities[0],
          providerId: 'prv_overlay',
        },
      ],
    }))
  })

  it('创建本地 overlay provider 与截图翻译 seed scene', async () => {
    const providers = [
      provider('prv_ocr', 'vision.ocr'),
      provider('prv_text', 'text.translate'),
      provider('prv_image', 'image.translate.e2e'),
    ]
    storeMocks.listProviderRegistryEntries.mockResolvedValue(providers)
    storeMocks.getSceneRegistryEntry.mockResolvedValue(null)
    storeMocks.createSceneRegistryEntry.mockResolvedValue(scene())

    const result = await ensureDefaultProviderSceneSeed(event)

    expect(storeMocks.createProviderRegistryEntry).toHaveBeenCalledWith(
      event,
      expect.objectContaining({
        name: 'custom-local-overlay',
        vendor: 'custom',
        authType: 'none',
        ownerScope: 'system',
        capabilities: [
          expect.objectContaining({ capability: 'overlay.render' }),
        ],
      }),
      'system:nexus-provider-scene-seed',
    )
    expect(storeMocks.createSceneRegistryEntry).toHaveBeenCalledWith(
      event,
      expect.objectContaining({
        id: 'corebox.screenshot.translate',
        requiredCapabilities: ['vision.ocr', 'text.translate', 'overlay.render'],
        bindings: expect.arrayContaining([
          expect.objectContaining({ providerId: 'prv_image', capability: 'image.translate.e2e' }),
          expect.objectContaining({ providerId: 'prv_ocr', capability: 'vision.ocr' }),
          expect.objectContaining({ providerId: 'prv_text', capability: 'text.translate' }),
          expect.objectContaining({ providerId: 'prv_overlay', capability: 'overlay.render' }),
        ]),
      }),
      'system:nexus-provider-scene-seed',
    )
    expect(result).toMatchObject({
      createdOverlayProvider: true,
      createdScreenshotScene: true,
      updatedScreenshotScene: false,
    })
  })

  it('幂等跳过已存在的 seed provider 与完整 seed scene', async () => {
    const overlay = provider('prv_overlay', 'overlay.render', {
      name: 'custom-local-overlay',
      metadata: { source: 'nexus-provider-scene-seed', seedId: 'custom-local-overlay' },
    })
    storeMocks.listProviderRegistryEntries.mockResolvedValue([overlay])
    storeMocks.getSceneRegistryEntry.mockResolvedValue(scene({
      metadata: { source: 'nexus-provider-scene-seed', seedId: 'corebox.screenshot.translate' },
      requiredCapabilities: ['vision.ocr', 'text.translate', 'overlay.render'],
      bindings: [
        {
          id: 'binding_overlay',
          sceneId: 'corebox.screenshot.translate',
          providerId: 'prv_overlay',
          capability: 'overlay.render',
          priority: 40,
          weight: null,
          status: 'enabled',
          constraints: null,
          metadata: { source: 'nexus-provider-scene-seed' },
          createdAt: '2026-05-11T00:00:00.000Z',
          updatedAt: '2026-05-11T00:00:00.000Z',
        },
      ],
    }))

    const result = await ensureDefaultProviderSceneSeed(event)

    expect(storeMocks.createProviderRegistryEntry).not.toHaveBeenCalled()
    expect(storeMocks.createSceneRegistryEntry).not.toHaveBeenCalled()
    expect(storeMocks.updateSceneRegistryEntry).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      overlayProviderId: 'prv_overlay',
      createdOverlayProvider: false,
      createdScreenshotScene: false,
      updatedScreenshotScene: false,
    })
  })

  it('只追加缺失 binding，不覆盖用户已有 Scene policy 与 binding', async () => {
    const overlay = provider('prv_overlay', 'overlay.render', {
      name: 'custom-local-overlay',
      metadata: { source: 'nexus-provider-scene-seed', seedId: 'custom-local-overlay' },
    })
    const text = provider('prv_text', 'text.translate')
    storeMocks.listProviderRegistryEntries.mockResolvedValue([overlay, text])
    storeMocks.getSceneRegistryEntry.mockResolvedValue(scene())
    storeMocks.updateSceneRegistryEntry.mockResolvedValue(scene())

    await ensureDefaultProviderSceneSeed(event)

    expect(storeMocks.updateSceneRegistryEntry).toHaveBeenCalledWith(
      event,
      'corebox.screenshot.translate',
      expect.objectContaining({
        displayName: 'Custom Screenshot Translate',
        strategyMode: 'manual',
        fallback: 'disabled',
        requiredCapabilities: ['image.translate.e2e'],
        bindings: [
          expect.objectContaining({
            providerId: 'prv_existing_image',
            capability: 'image.translate.e2e',
            priority: 5,
            constraints: { maxImageBytes: 1024 },
            metadata: { route: 'admin' },
          }),
          expect.objectContaining({
            providerId: 'prv_text',
            capability: 'text.translate',
          }),
          expect.objectContaining({
            providerId: 'prv_overlay',
            capability: 'overlay.render',
          }),
        ],
      }),
    )
  })

  it('不会把 user scope 的 AI mirror OCR provider 自动绑定进 system scene', async () => {
    const overlay = provider('prv_overlay', 'overlay.render', {
      name: 'custom-local-overlay',
      metadata: { source: 'nexus-provider-scene-seed', seedId: 'custom-local-overlay' },
    })
    const userOcr = provider('prv_user_ocr', 'vision.ocr', {
      ownerScope: 'user',
      ownerId: 'user_1',
      authType: 'api_key',
      authRef: 'secure://providers/user-ocr',
    })
    storeMocks.listProviderRegistryEntries.mockResolvedValue([overlay, userOcr])
    storeMocks.getSceneRegistryEntry.mockResolvedValue(null)
    storeMocks.createSceneRegistryEntry.mockResolvedValue(scene())

    await ensureDefaultProviderSceneSeed(event)

    const input = storeMocks.createSceneRegistryEntry.mock.calls[0][1]
    expect(input.bindings).toEqual([
      expect.objectContaining({
        providerId: 'prv_overlay',
        capability: 'overlay.render',
      }),
    ])
  })

  it('只有 direct 图片翻译 provider 时默认 requiredCapabilities 保持 image.translate.e2e', async () => {
    const overlay = provider('prv_overlay', 'overlay.render', {
      name: 'custom-local-overlay',
      metadata: { source: 'nexus-provider-scene-seed', seedId: 'custom-local-overlay' },
    })
    const image = provider('prv_image', 'image.translate.e2e')
    storeMocks.listProviderRegistryEntries.mockResolvedValue([overlay, image])
    storeMocks.getSceneRegistryEntry.mockResolvedValue(null)
    storeMocks.createSceneRegistryEntry.mockResolvedValue(scene())

    await ensureDefaultProviderSceneSeed(event)

    const input = storeMocks.createSceneRegistryEntry.mock.calls[0][1]
    expect(input.requiredCapabilities).toEqual(['image.translate.e2e'])
    expect(input.bindings).toEqual([
      expect.objectContaining({
        providerId: 'prv_image',
        capability: 'image.translate.e2e',
      }),
      expect.objectContaining({
        providerId: 'prv_overlay',
        capability: 'overlay.render',
      }),
    ])
  })

  it('同名 provider 缺少 overlay.render capability 时不会被当成 seed provider', async () => {
    const invalidOverlay = provider('prv_invalid_overlay', 'text.translate', {
      name: 'custom-local-overlay',
      metadata: { source: 'nexus-provider-scene-seed', seedId: 'custom-local-overlay' },
    })
    storeMocks.listProviderRegistryEntries.mockResolvedValue([invalidOverlay])
    storeMocks.getSceneRegistryEntry.mockResolvedValue(null)
    storeMocks.createSceneRegistryEntry.mockResolvedValue(scene())

    await ensureDefaultProviderSceneSeed(event)

    expect(storeMocks.createProviderRegistryEntry).toHaveBeenCalled()
  })
})
