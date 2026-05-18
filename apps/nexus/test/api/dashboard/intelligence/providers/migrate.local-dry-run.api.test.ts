import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { formatMigrationEvidenceSummary } from '../../../../../app/utils/intelligence-provider-migration'
import { MockD1Database, seedOpenAiIntelligenceProvider } from '../../../../helpers/provider-registry-test-utils'

const authMocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
}))

const h3Mocks = vi.hoisted(() => ({
  readBody: vi.fn(),
}))

vi.mock('../../../../../server/utils/auth', () => authMocks)

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
  migrateHandler = (await import('../../../../../server/api/dashboard/intelligence/providers/migrate.post')).default as (event: any) => Promise<any>
})

function makeEvent(db: MockD1Database) {
  return {
    path: '/api/dashboard/intelligence/providers/migrate',
    node: { req: { url: '/api/dashboard/intelligence/providers/migrate' } },
    context: {
      cloudflare: {
        env: {
          DB: db,
          PROVIDER_REGISTRY_SECURE_STORE_KEY: 'local-test-secure-store-key',
        },
      },
    },
  }
}

describe('/api/dashboard/intelligence/providers/migrate local dry-run evidence', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authMocks.requireAdmin.mockResolvedValue({
      userId: 'admin-user-1',
      user: { role: 'admin' },
    })
    h3Mocks.readBody.mockResolvedValue({})
  })

  it('runs the real migration bridge through the API handler without writing registry or secrets', async () => {
    const db = new MockD1Database()
    seedOpenAiIntelligenceProvider(db)

    const result = await migrateHandler(makeEvent(db))
    const summary = formatMigrationEvidenceSummary(result.migration)

    expect(authMocks.requireAdmin).toHaveBeenCalledWith(expect.anything())
    expect(summary).toBe([
      '# Provider Registry migration evidence',
      '',
      'mode: dry-run',
      'readiness: planning',
      'registryPrimaryReady: no',
      'total: 1',
      'migrated: 0',
      'skipped: 0',
      'failed: 0',
      'blockers: migration_dry_run_only, migration_not_executed',
      '',
      'items:',
      '- OpenAI Main (ip_local_dry_run): would_create; secret=unchanged reason=legacy_api_key_would_move_to_secure_store',
    ].join('\n'))
    expect(summary).not.toContain('encrypted-local-secret-placeholder')
    expect(db.providers.size).toBe(0)
    expect(db.credentials.size).toBe(0)
  })
})
