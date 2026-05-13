import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const authMocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
}))

const h3Mocks = vi.hoisted(() => ({
  readBody: vi.fn(),
}))

const migrationMocks = vi.hoisted(() => ({
  migrateLegacyIntelligenceProvidersToRegistry: vi.fn(),
}))

vi.mock('../../../../utils/auth', () => authMocks)
vi.mock('../../../../utils/intelligenceProviderRegistryBridge', () => migrationMocks)

vi.mock('h3', async () => {
  const actual = await vi.importActual<typeof import('h3')>('h3')
  return {
    ...actual,
    readBody: h3Mocks.readBody,
  }
})

let migrateHandler: (event: any) => Promise<any>

beforeAll(async () => {
  ;(globalThis as any).defineEventHandler = (fn: any) => fn
  migrateHandler = (await import('./migrate.post')).default as (event: any) => Promise<any>
})

function makeEvent() {
  return {
    path: '/api/dashboard/intelligence/providers/migrate',
    node: { req: { url: '/api/dashboard/intelligence/providers/migrate' } },
  }
}

describe('/api/dashboard/intelligence/providers/migrate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authMocks.requireAdmin.mockResolvedValue({
      userId: 'admin_1',
      user: { role: 'admin' },
    })
    h3Mocks.readBody.mockResolvedValue({})
    migrationMocks.migrateLegacyIntelligenceProvidersToRegistry.mockResolvedValue({
      dryRun: true,
      total: 1,
      migrated: 0,
      skipped: 0,
      failed: 0,
      items: [
        {
          providerId: 'ip_1',
          providerName: 'OpenAI Main',
          action: 'would_create',
          registryProviderId: null,
          migratedApiKey: false,
          reason: 'legacy_api_key_would_move_to_secure_store',
        },
      ],
    })
  })

  it('默认以 dry-run 方式迁移旧 intelligence providers', async () => {
    const result = await migrateHandler(makeEvent())

    expect(authMocks.requireAdmin).toHaveBeenCalledWith(expect.anything())
    expect(migrationMocks.migrateLegacyIntelligenceProvidersToRegistry).toHaveBeenCalledWith(
      expect.anything(),
      'admin_1',
      'admin_1',
      {
        dryRun: true,
        providerIds: undefined,
      },
    )
    expect(result.migration).toMatchObject({
      dryRun: true,
      total: 1,
      items: [
        expect.objectContaining({ action: 'would_create' }),
      ],
    })
  })

  it('支持显式 execute 和 providerIds 过滤', async () => {
    h3Mocks.readBody.mockResolvedValue({
      dryRun: false,
      providerIds: [' ip_1 ', '', 12, 'ip_2'],
    })

    await migrateHandler(makeEvent())

    expect(migrationMocks.migrateLegacyIntelligenceProvidersToRegistry).toHaveBeenCalledWith(
      expect.anything(),
      'admin_1',
      'admin_1',
      {
        dryRun: false,
        providerIds: ['ip_1', 'ip_2'],
      },
    )
  })

  it('拒绝非数组 providerIds', async () => {
    h3Mocks.readBody.mockResolvedValue({
      providerIds: 'ip_1',
    })

    await expect(migrateHandler(makeEvent())).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: 'providerIds must be an array.',
    })
    expect(migrationMocks.migrateLegacyIntelligenceProvidersToRegistry).not.toHaveBeenCalled()
  })
})
