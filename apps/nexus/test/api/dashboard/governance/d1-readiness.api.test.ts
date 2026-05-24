import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  db: null as MockReadinessD1Database | null,
}))

const authMocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
}))

vi.mock('../../../../server/utils/auth', () => authMocks)
vi.mock('../../../../server/utils/cloudflare', () => ({
  readCloudflareBindings: () => state.db ? { DB: state.db } : undefined,
}))

class MockReadinessStatement {
  private args: any[] = []

  constructor(
    private readonly db: MockReadinessD1Database,
    private readonly sql: string,
  ) {}

  bind(...args: any[]) {
    this.args = args
    return this
  }

  async first<T = any>() {
    return this.db.first(this.sql, this.args) as T
  }

  async all<T = any>() {
    return { results: this.db.all(this.sql) as T[] }
  }
}

class MockReadinessD1Database {
  objects = new Map<string, 'table' | 'index'>()
  counts = new Map<string, number>()

  prepare(sql: string) {
    return new MockReadinessStatement(this, sql)
  }

  addTable(name: string) {
    this.objects.set(name, 'table')
  }

  addIndex(name: string) {
    this.objects.set(name, 'index')
  }

  setCount(key: string, count: number) {
    this.counts.set(key, count)
  }

  all(sql: string) {
    if (sql.includes('sqlite_master')) {
      return [...this.objects.entries()].map(([name, type]) => ({ name, type }))
    }
    return []
  }

  first(sql: string, args: any[]) {
    const table = sql.match(/FROM\s+([a-zA-Z0-9_]+)/)?.[1] ?? 'unknown'
    let key = table
    if (sql.includes('config_type = ?'))
      key = `${table}:config_type:${String(args[0])}`
    else if (sql.includes('action IN (?, ?)'))
      key = `${table}:actions:${args.map(String).join('|')}`
    else if (sql.includes('action LIKE ?'))
      key = `${table}:action_like:${String(args[0])}`
    else if (sql.includes('scope = ?'))
      key = `${table}:scope:${String(args[0])}`
    return { total: this.counts.get(key) ?? 0 }
  }
}

let handler: (event: any) => Promise<any>

beforeAll(async () => {
  ;(globalThis as any).defineEventHandler = (fn: any) => fn
  handler = (await import('../../../../server/api/dashboard/governance/d1-readiness.get')).default as (event: any) => Promise<any>
})

function makeEvent() {
  return {
    path: '/api/dashboard/governance/d1-readiness',
    node: {
      req: {
        url: '/api/dashboard/governance/d1-readiness',
        headers: {
          'user-agent': 'vitest',
        },
      },
    },
    context: {},
  }
}

function seedMinimumReadyDatabase(db: MockReadinessD1Database) {
  for (const table of [
    'platform_governance_events',
    'platform_governance_configs',
    'storage_secure_store',
    'notification_secure_store',
    'browser_push_subscriptions',
    'browser_notification_inbox',
  ]) {
    db.addTable(table)
  }
  for (const index of [
    'idx_platform_governance_events_scope_action_at',
    'idx_platform_governance_events_resource_at',
    'idx_platform_governance_events_channel_at',
    'idx_platform_governance_configs_type_target',
    'idx_platform_governance_configs_unique',
    'idx_storage_secure_store_type',
    'idx_notification_secure_store_type',
    'idx_browser_push_subscriptions_user_endpoint',
    'idx_browser_push_subscriptions_user_updated',
    'idx_browser_notification_inbox_user_status_created',
    'idx_browser_notification_inbox_resource',
  ]) {
    db.addIndex(index)
  }
  db.setCount('platform_governance_events', 1)
  db.setCount('platform_governance_configs:config_type:analytics_collection', 1)
  db.setCount('platform_governance_configs:config_type:storage_channel', 1)
  db.setCount('platform_governance_configs:config_type:notification_channel', 1)
  db.setCount('platform_governance_configs:config_type:intelligence_provider_quota', 1)
  db.setCount('storage_secure_store', 1)
  db.setCount('notification_secure_store', 1)
  db.setCount('browser_push_subscriptions', 1)
  db.setCount('platform_governance_events:actions:storage.channel_smoke.ready|storage.channel_smoke.sent', 1)
  db.setCount('platform_governance_events:action_like:notification.delivery.%', 1)
  db.setCount('platform_governance_events:scope:upload', 1)
}

describe('/api/dashboard/governance/d1-readiness', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.db = null
    authMocks.requireAdmin.mockResolvedValue({
      userId: 'admin_1',
      user: { role: 'admin' },
    })
  })

  it('requires admin and returns blocked readiness when DB binding is missing', async () => {
    const result = await handler(makeEvent())

    expect(authMocks.requireAdmin).toHaveBeenCalledWith(expect.anything())
    expect(result.status).toBe('blocked')
    expect(result.database).toEqual({ present: false, binding: null })
    expect(result.summary.missingTables).toBeGreaterThan(0)
  })

  it('returns ready D1 readiness without leaking raw admin or credential data', async () => {
    const db = new MockReadinessD1Database()
    state.db = db
    seedMinimumReadyDatabase(db)

    const result = await handler(makeEvent())
    const serialized = JSON.stringify(result)

    expect(result.status).toBe('ready')
    expect(result.database).toEqual({ present: true, binding: 'DB' })
    expect(result.summary).toEqual(expect.objectContaining({
      blocked: 0,
      warning: 0,
      backfillRequired: 0,
    }))
    expect(serialized).not.toContain('admin_1')
    expect(serialized).not.toContain('secure://')
    expect(serialized).not.toContain('apiKey')
    expect(serialized).not.toContain('secret')
  })
})
