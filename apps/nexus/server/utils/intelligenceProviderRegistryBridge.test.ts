import type { IntelligenceProviderRecord } from './intelligenceStore'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildIntelligenceProviderAuthRef,
  deleteIntelligenceProviderRegistryMirror,
  getIntelligenceProviderRegistryMirrorApiKey,
  listIntelligenceProviderRegistryMirrors,
  migrateLegacyIntelligenceProvidersToRegistry,
  mergeIntelligenceProvidersWithRegistryMirrors,
  syncIntelligenceProviderToRegistry,
} from './intelligenceProviderRegistryBridge'

const intelligenceStoreMocks = vi.hoisted(() => ({
  listProviders: vi.fn(),
  getProviderApiKey: vi.fn(),
}))

const registryMocks = vi.hoisted(() => ({
  createProviderRegistryEntry: vi.fn(),
  updateProviderRegistryEntry: vi.fn(),
  deleteProviderRegistryEntry: vi.fn(),
  listProviderRegistryEntries: vi.fn(),
}))

const credentialMocks = vi.hoisted(() => ({
  storeProviderCredential: vi.fn(),
  getProviderCredential: vi.fn(),
  deleteProviderCredential: vi.fn(),
}))

vi.mock('./intelligenceStore', () => intelligenceStoreMocks)
vi.mock('./providerRegistryStore', () => registryMocks)
vi.mock('./providerCredentialStore', () => credentialMocks)

function provider(overrides: Partial<IntelligenceProviderRecord> = {}): IntelligenceProviderRecord {
  return {
    id: 'ip_ai_provider_1',
    userId: 'admin-user-1',
    type: 'openai',
    name: 'OpenAI Main',
    enabled: true,
    hasApiKey: true,
    baseUrl: 'https://api.openai.com/v1/',
    models: ['gpt-4.1-mini'],
    defaultModel: 'gpt-4.1-mini',
    instructions: 'Use concise answers.',
    timeout: 30000,
    priority: 20,
    rateLimit: { rpm: 60 },
    capabilities: ['text.chat', 'text.summarize'],
    metadata: null,
    createdAt: '2026-05-10T00:00:00.000Z',
    updatedAt: '2026-05-10T00:00:00.000Z',
    ...overrides,
  }
}

describe('intelligenceProviderRegistryBridge', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    registryMocks.listProviderRegistryEntries.mockResolvedValue([])
    registryMocks.createProviderRegistryEntry.mockResolvedValue({ id: 'prv_created' })
    registryMocks.updateProviderRegistryEntry.mockResolvedValue({ id: 'prv_existing' })
    registryMocks.deleteProviderRegistryEntry.mockResolvedValue(true)
    credentialMocks.storeProviderCredential.mockResolvedValue({ success: true })
    credentialMocks.getProviderCredential.mockResolvedValue(null)
    credentialMocks.deleteProviderCredential.mockResolvedValue(true)
    intelligenceStoreMocks.listProviders.mockResolvedValue([provider()])
    intelligenceStoreMocks.getProviderApiKey.mockResolvedValue('sk-source')
  })

  it('creates a Provider Registry mirror with normalized AI capabilities and secure authRef', async () => {
    await syncIntelligenceProviderToRegistry({} as any, provider(), 'admin-user-1', {
      apiKey: 'sk-test',
    })

    expect(credentialMocks.storeProviderCredential).toHaveBeenCalledWith(expect.anything(), {
      authRef: 'secure://providers/intelligence-ip_ai_provider_1',
      authType: 'api_key',
      credentials: { apiKey: 'sk-test' },
    }, 'admin-user-1')

    expect(registryMocks.createProviderRegistryEntry).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      name: 'ip_ai_provider_1',
      displayName: 'OpenAI Main',
      vendor: 'openai',
      status: 'enabled',
      authType: 'api_key',
      authRef: 'secure://providers/intelligence-ip_ai_provider_1',
      ownerScope: 'user',
      ownerId: 'admin-user-1',
      endpoint: 'https://api.openai.com/v1/',
      metadata: expect.not.objectContaining({ apiKey: expect.anything() }),
    }), 'admin-user-1')

    const input = registryMocks.createProviderRegistryEntry.mock.calls[0][1]
    expect(input.capabilities.map((item: any) => item.capability)).toEqual([
      'chat.completion',
      'text.summarize',
    ])
    expect(input.metadata).toMatchObject({
      source: 'intelligence',
      intelligenceProviderId: 'ip_ai_provider_1',
      intelligenceType: 'openai',
      hasApiKey: true,
      instructionsConfigured: true,
    })
  })

  it('updates the existing mirror instead of creating a duplicate', async () => {
    registryMocks.listProviderRegistryEntries.mockResolvedValue([
      {
        id: 'prv_existing',
        metadata: {
          source: 'intelligence',
          intelligenceProviderId: 'ip_ai_provider_1',
        },
      },
    ])

    await syncIntelligenceProviderToRegistry({} as any, provider({ enabled: false }), 'admin-user-1')

    expect(registryMocks.createProviderRegistryEntry).not.toHaveBeenCalled()
    expect(registryMocks.updateProviderRegistryEntry).toHaveBeenCalledWith(expect.anything(), 'prv_existing', expect.objectContaining({
      status: 'disabled',
      metadata: expect.objectContaining({
        providerRegistryId: 'prv_existing',
      }),
    }))
  })

  it('preserves existing registry metadata when syncing provider fields', async () => {
    registryMocks.listProviderRegistryEntries.mockResolvedValue([
      {
        id: 'prv_existing',
        metadata: {
          source: 'intelligence',
          intelligenceProviderId: 'ip_ai_provider_1',
          routingShape: 'providers-scenes',
          sceneModelOverrides: {
            'nexus.intelligence.chat': 'gpt-4.1-mini',
          },
        },
      },
    ])

    await syncIntelligenceProviderToRegistry({} as any, provider({
      defaultModel: 'gpt-4.1',
    }), 'admin-user-1')

    const input = registryMocks.updateProviderRegistryEntry.mock.calls[0][2]
    expect(input.metadata).toMatchObject({
      source: 'intelligence',
      intelligenceProviderId: 'ip_ai_provider_1',
      providerRegistryId: 'prv_existing',
      defaultModel: 'gpt-4.1',
      routingShape: 'providers-scenes',
      sceneModelOverrides: {
        'nexus.intelligence.chat': 'gpt-4.1-mini',
      },
    })
  })

  it('maps local intelligence providers to vision.ocr without credential requirement', async () => {
    await syncIntelligenceProviderToRegistry({} as any, provider({
      type: 'local',
      hasApiKey: false,
      capabilities: null,
    }), 'admin-user-1')

    const input = registryMocks.createProviderRegistryEntry.mock.calls[0][1]
    expect(input.authType).toBe('none')
    expect(input.authRef).toBeNull()
    expect(input.vendor).toBe('custom')
    expect(input.capabilities.map((item: any) => item.capability)).toEqual([
      'chat.completion',
      'text.summarize',
      'vision.ocr',
    ])
  })

  it('deletes stale secure credential when api key is cleared', async () => {
    await syncIntelligenceProviderToRegistry({} as any, provider({ hasApiKey: false }), 'admin-user-1', {
      apiKey: null,
    })

    expect(credentialMocks.deleteProviderCredential).toHaveBeenCalledWith(
      expect.anything(),
      buildIntelligenceProviderAuthRef('ip_ai_provider_1'),
    )
    const input = registryMocks.createProviderRegistryEntry.mock.calls[0][1]
    expect(input.authType).toBe('none')
    expect(input.authRef).toBeNull()
  })

  it('deletes the registry mirror and secure credential', async () => {
    registryMocks.listProviderRegistryEntries.mockResolvedValue([
      {
        id: 'prv_existing',
        metadata: {
          source: 'intelligence',
          intelligenceProviderId: 'ip_ai_provider_1',
        },
      },
    ])

    await expect(deleteIntelligenceProviderRegistryMirror({} as any, 'ip_ai_provider_1')).resolves.toBe(true)

    expect(registryMocks.deleteProviderRegistryEntry).toHaveBeenCalledWith(expect.anything(), 'prv_existing')
    expect(credentialMocks.deleteProviderCredential).toHaveBeenCalledWith(
      expect.anything(),
      buildIntelligenceProviderAuthRef('ip_ai_provider_1'),
    )
  })

  it('reads registry-only intelligence mirrors in the source provider shape', async () => {
    registryMocks.listProviderRegistryEntries.mockResolvedValue([
      {
        id: 'prv_ai_registry_only',
        name: 'ip_ai_registry_only',
        displayName: 'Registry AI',
        vendor: 'openai',
        status: 'enabled',
        authType: 'api_key',
        authRef: 'secure://providers/intelligence-ip_ai_registry_only',
        ownerScope: 'user',
        ownerId: 'admin-user-1',
        endpoint: 'https://api.openai.com/v1',
        metadata: {
          source: 'intelligence',
          intelligenceProviderId: 'ip_ai_registry_only',
          intelligenceType: 'openai',
          models: ['gpt-4.1-mini'],
          defaultModel: 'gpt-4.1-mini',
          timeout: 45000,
          priority: 7,
          rateLimit: { rpm: 30 },
          instructionsConfigured: true,
        },
        capabilities: [
          { capability: 'chat.completion' },
          { capability: 'text.summarize' },
        ],
        createdAt: '2026-05-11T00:00:00.000Z',
        updatedAt: '2026-05-11T00:00:01.000Z',
      },
      {
        id: 'prv_other_source',
        ownerScope: 'user',
        ownerId: 'admin-user-1',
        metadata: { source: 'translation' },
      },
      {
        id: 'prv_other_user',
        ownerScope: 'user',
        ownerId: 'another-user',
        metadata: {
          source: 'intelligence',
          intelligenceProviderId: 'ip_other',
          intelligenceType: 'openai',
        },
      },
    ])

    const mirrors = await listIntelligenceProviderRegistryMirrors({} as any, 'admin-user-1')

    expect(mirrors).toHaveLength(1)
    expect(mirrors[0]).toMatchObject({
      id: 'ip_ai_registry_only',
      userId: 'admin-user-1',
      type: 'openai',
      name: 'Registry AI',
      enabled: true,
      hasApiKey: true,
      baseUrl: 'https://api.openai.com/v1',
      models: ['gpt-4.1-mini'],
      defaultModel: 'gpt-4.1-mini',
      timeout: 45000,
      priority: 7,
      rateLimit: { rpm: 30 },
      capabilities: ['text.chat', 'text.summarize'],
      metadata: expect.objectContaining({
        providerRegistryId: 'prv_ai_registry_only',
        instructionsConfigured: true,
      }),
    })
  })

  it('merges source providers before registry mirrors and sorts by priority', () => {
    const existing = provider({ id: 'ip_existing', priority: 10, createdAt: '2026-05-11T00:00:10.000Z' })
    const duplicateMirror = provider({ id: 'ip_existing', name: 'Registry duplicate', priority: 1 })
    const registryOnly = provider({ id: 'ip_registry_only', priority: 5, createdAt: '2026-05-11T00:00:05.000Z' })

    const merged = mergeIntelligenceProvidersWithRegistryMirrors([existing], [duplicateMirror, registryOnly])

    expect(merged.map(item => item.id)).toEqual(['ip_registry_only', 'ip_existing'])
    expect(merged.find(item => item.id === 'ip_existing')?.name).toBe('OpenAI Main')
  })

  it('reads registry mirror API keys from secure store for registry-only tests', async () => {
    registryMocks.listProviderRegistryEntries.mockResolvedValue([
      {
        id: 'prv_ai_registry_only',
        authType: 'api_key',
        authRef: 'secure://providers/intelligence-ip_ai_registry_only',
        ownerScope: 'user',
        ownerId: 'admin-user-1',
        metadata: {
          source: 'intelligence',
          intelligenceProviderId: 'ip_ai_registry_only',
        },
      },
    ])
    credentialMocks.getProviderCredential.mockResolvedValue({ apiKey: 'sk-from-secure-store' })

    await expect(getIntelligenceProviderRegistryMirrorApiKey(
      {} as any,
      'admin-user-1',
      'ip_ai_registry_only',
    )).resolves.toBe('sk-from-secure-store')

    expect(credentialMocks.getProviderCredential).toHaveBeenCalledWith(
      expect.anything(),
      'secure://providers/intelligence-ip_ai_registry_only',
    )
  })

  it('dry-run 迁移旧 intelligence providers 时只返回计划，不写 registry 或 secure store', async () => {
    const result = await migrateLegacyIntelligenceProvidersToRegistry({} as any, 'admin-user-1', 'admin-user-1')

    expect(result).toMatchObject({
      dryRun: true,
      total: 1,
      migrated: 0,
      failed: 0,
      items: [
        expect.objectContaining({
          providerId: 'ip_ai_provider_1',
          action: 'would_create',
          migratedApiKey: false,
          reason: 'legacy_api_key_would_move_to_secure_store',
        }),
      ],
    })
    expect(credentialMocks.storeProviderCredential).not.toHaveBeenCalled()
    expect(registryMocks.createProviderRegistryEntry).not.toHaveBeenCalled()
    expect(registryMocks.updateProviderRegistryEntry).not.toHaveBeenCalled()
  })

  it('execute 迁移旧 intelligence providers 时把 API key 写入 secure store 并创建 mirror', async () => {
    const result = await migrateLegacyIntelligenceProvidersToRegistry({} as any, 'admin-user-1', 'admin-user-1', {
      dryRun: false,
    })

    expect(intelligenceStoreMocks.getProviderApiKey).toHaveBeenCalledWith(
      expect.anything(),
      'admin-user-1',
      'ip_ai_provider_1',
    )
    expect(credentialMocks.storeProviderCredential).toHaveBeenCalledWith(expect.anything(), {
      authRef: 'secure://providers/intelligence-ip_ai_provider_1',
      authType: 'api_key',
      credentials: { apiKey: 'sk-source' },
    }, 'admin-user-1')
    expect(registryMocks.createProviderRegistryEntry).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      ownerScope: 'user',
      ownerId: 'admin-user-1',
      authType: 'api_key',
      authRef: 'secure://providers/intelligence-ip_ai_provider_1',
    }), 'admin-user-1')
    expect(result).toMatchObject({
      dryRun: false,
      total: 1,
      migrated: 1,
      failed: 0,
      items: [
        expect.objectContaining({
          providerId: 'ip_ai_provider_1',
          action: 'created',
          registryProviderId: 'prv_created',
          migratedApiKey: true,
        }),
      ],
    })
  })

  it('execute 迁移遇到旧表 API key 不可读时标记 failed 且不创建 mirror', async () => {
    intelligenceStoreMocks.getProviderApiKey.mockResolvedValue(null)

    const result = await migrateLegacyIntelligenceProvidersToRegistry({} as any, 'admin-user-1', 'admin-user-1', {
      dryRun: false,
    })

    expect(registryMocks.createProviderRegistryEntry).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      dryRun: false,
      total: 1,
      migrated: 0,
      failed: 1,
      items: [
        expect.objectContaining({
          providerId: 'ip_ai_provider_1',
          action: 'failed',
          reason: 'legacy_api_key_unavailable',
        }),
      ],
    })
  })

  it('迁移可按 providerIds 过滤旧表 provider', async () => {
    intelligenceStoreMocks.listProviders.mockResolvedValue([
      provider({ id: 'ip_a', hasApiKey: false }),
      provider({ id: 'ip_b', hasApiKey: false }),
    ])

    const result = await migrateLegacyIntelligenceProvidersToRegistry({} as any, 'admin-user-1', 'admin-user-1', {
      dryRun: true,
      providerIds: ['ip_b'],
    })

    expect(result.total).toBe(1)
    expect(result.items[0]).toMatchObject({
      providerId: 'ip_b',
      action: 'would_create',
    })
  })
})
