import { describe, expect, it, vi } from 'vitest'
import { getPlatformGovernanceD1Readiness } from './platformGovernanceD1Readiness'

const state = vi.hoisted(() => ({
  db: null as MockReadinessD1Database | null,
}))

vi.mock('./cloudflare', () => ({
  readCloudflareBindings: () => state.db ? { DB: state.db } : undefined,
}))

type SqliteObjectType = 'table' | 'index'

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
    return { results: this.db.all(this.sql, this.args) as T[] }
  }
}

class MockReadinessD1Database {
  objects = new Map<string, SqliteObjectType>()
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

function makeEvent() {
  return {
    path: '/api/dashboard/governance/d1-readiness',
    node: {
      req: {
        headers: {
          'user-agent': 'vitest',
        },
      },
    },
    context: {},
  } as any
}

function seedGovernanceSchema(db: MockReadinessD1Database) {
  db.addTable('platform_governance_events')
  db.addTable('platform_governance_configs')
  db.addIndex('idx_platform_governance_events_scope_action_at')
  db.addIndex('idx_platform_governance_events_resource_at')
  db.addIndex('idx_platform_governance_events_channel_at')
  db.addIndex('idx_platform_governance_configs_type_target')
  db.addIndex('idx_platform_governance_configs_unique')
}

function seedCredentialAndNotificationSchema(db: MockReadinessD1Database) {
  db.addTable('storage_secure_store')
  db.addTable('notification_secure_store')
  db.addTable('browser_push_subscriptions')
  db.addTable('browser_notification_inbox')
  db.addIndex('idx_storage_secure_store_type')
  db.addIndex('idx_notification_secure_store_type')
  db.addIndex('idx_browser_push_subscriptions_user_endpoint')
  db.addIndex('idx_browser_push_subscriptions_user_updated')
  db.addIndex('idx_browser_notification_inbox_user_status_created')
  db.addIndex('idx_browser_notification_inbox_resource')
}

function seedRequiredCounts(db: MockReadinessD1Database) {
  db.setCount('platform_governance_events', 1)
  db.setCount('platform_governance_configs:config_type:analytics_collection', 1)
  db.setCount('platform_governance_configs:config_type:storage_channel', 1)
  db.setCount('platform_governance_configs:config_type:notification_channel', 1)
  db.setCount('platform_governance_configs:config_type:intelligence_provider_quota', 1)
  db.setCount('storage_secure_store', 1)
  db.setCount('notification_secure_store', 1)
  db.setCount('browser_push_subscriptions', 1)
}

describe('platformGovernanceD1Readiness', () => {
  it('blocks readiness when D1 binding is missing', async () => {
    state.db = null

    const readiness = await getPlatformGovernanceD1Readiness(makeEvent())

    expect(readiness.status).toBe('blocked')
    expect(readiness.database).toEqual({ present: false, binding: null })
    expect(readiness.summary.blocked).toBe(readiness.summary.total)
    expect(readiness.summary.missingTables).toBeGreaterThan(0)
    expect(readiness.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'governance-events-schema',
        status: 'blocked',
        reasons: ['d1-binding-missing'],
      }),
    ]))
  })

  it('reports missing indexes and required backfill without exposing secrets', async () => {
    const db = new MockReadinessD1Database()
    state.db = db
    seedGovernanceSchema(db)
    seedCredentialAndNotificationSchema(db)
    db.objects.delete('idx_platform_governance_events_channel_at')
    seedRequiredCounts(db)
    db.setCount('storage_secure_store', 0)

    const readiness = await getPlatformGovernanceD1Readiness(makeEvent())
    const serialized = JSON.stringify(readiness)

    expect(readiness.status).toBe('warning')
    expect(readiness.database).toEqual({ present: true, binding: 'DB' })
    expect(readiness.summary.missingTables).toBe(0)
    expect(readiness.summary.missingIndexes).toBe(1)
    expect(readiness.summary.backfillRequired).toBeGreaterThanOrEqual(1)
    expect(readiness.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'governance-events-schema',
        status: 'warning',
        missingIndexes: ['idx_platform_governance_events_channel_at'],
        reasons: ['d1-index-missing'],
      }),
      expect.objectContaining({
        id: 'storage-secure-store-schema',
        status: 'warning',
        observedCount: 0,
        minimumCount: 1,
        reasons: ['storage-credential-backfill-required'],
      }),
    ]))
    expect(serialized).not.toContain('secure://')
    expect(serialized).not.toContain('apiKey')
    expect(serialized).not.toContain('secret')
  })

  it('marks schema ready when required tables, indexes, seeds, and evidence exist', async () => {
    const db = new MockReadinessD1Database()
    state.db = db
    seedGovernanceSchema(db)
    seedCredentialAndNotificationSchema(db)
    seedRequiredCounts(db)
    db.setCount('platform_governance_events:actions:storage.channel_smoke.ready|storage.channel_smoke.sent', 1)
    db.setCount('platform_governance_events:action_like:notification.delivery.%', 1)
    db.setCount('platform_governance_events:scope:upload', 1)

    const readiness = await getPlatformGovernanceD1Readiness(makeEvent())

    expect(readiness.status).toBe('ready')
    expect(readiness.summary).toEqual(expect.objectContaining({
      blocked: 0,
      warning: 0,
      missingTables: 0,
      missingIndexes: 0,
      backfillRequired: 0,
    }))
    expect(readiness.checks.every(check => check.status === 'ready')).toBe(true)
  })
})
