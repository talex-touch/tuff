import { describe, expect, it, vi } from 'vitest'

vi.mock('../cloudflare', () => ({
  readCloudflareBindings: (event: any) => event.context.cloudflare?.env,
}))

interface UserRow {
  id: string
  email: string
  name: string | null
  image: string | null
  email_verified: string | null
  email_state: string
  role: string
  locale: string | null
  status: string
  merged_to_user_id: string | null
  merged_at: string | null
  merged_by_user_id: string | null
  disabled_at: string | null
  deletion_requested_at: string | null
  deletion_scheduled_at: string | null
  deletion_cancelled_at: string | null
  deletion_terms_version: string | null
  privacy_analytics: number
  privacy_crash_reports: number
  privacy_usage_data: number
  privacy_personalization: number
  allow_cli_ip_mismatch: number
  created_at: string
}

class MockStatement {
  private args: any[] = []

  constructor(
    private readonly db: MockD1Database,
    private readonly sql: string,
  ) {}

  bind(...args: any[]) {
    this.args = args
    return this
  }

  async run() {
    return this.db.run(this.sql, this.args)
  }

  async first() {
    return this.db.first(this.sql, this.args)
  }

  async all() {
    return this.db.all(this.sql)
  }
}

class MockD1Database {
  readonly users = new Map<string, UserRow>()

  prepare(sql: string) {
    return new MockStatement(this, sql)
  }

  run(sql: string, args: any[]) {
    if (sql.includes('CREATE TABLE') || sql.includes('CREATE INDEX') || sql.includes('ALTER TABLE'))
      return { meta: { changes: 0 } }

    if (sql.includes("SET status = 'active'") && sql.includes("status = 'deletion_pending'")) {
      const [cancelledAt, userId] = args
      const row = this.users.get(userId)
      if (!row || row.status !== 'deletion_pending')
        return { meta: { changes: 0 } }

      this.users.set(userId, {
        ...row,
        status: 'active',
        deletion_requested_at: null,
        deletion_scheduled_at: null,
        deletion_cancelled_at: cancelledAt,
        deletion_terms_version: null,
      })
      return { meta: { changes: 1 } }
    }

    return { meta: { changes: 0 } }
  }

  first(sql: string, args: any[]) {
    if (sql.includes('SELECT * FROM auth_users WHERE id = ?')) {
      const [userId] = args
      return this.users.get(userId) ?? null
    }
    return null
  }

  all(sql: string) {
    if (sql.includes('PRAGMA table_info')) {
      return {
        results: [
          'status',
          'email_state',
          'merged_to_user_id',
          'merged_at',
          'merged_by_user_id',
          'disabled_at',
          'privacy_analytics',
          'privacy_crash_reports',
          'privacy_usage_data',
          'privacy_personalization',
          'allow_cli_ip_mismatch',
          'deletion_requested_at',
          'deletion_scheduled_at',
          'deletion_cancelled_at',
          'deletion_terms_version',
          'grant_type',
          'cancelled_at',
          'client_type',
          'request_ip',
          'reject_reason',
          'reject_message',
          'reject_request_ip',
          'reject_current_ip',
          'rejected_at',
          'browser_state',
          'browser_seen_at',
          'browser_closed_at',
          'trusted_at',
          'last_seen_ip',
          'last_seen_country_code',
          'last_seen_region_code',
          'last_seen_region_name',
          'last_seen_city',
          'last_seen_latitude',
          'last_seen_longitude',
          'last_seen_timezone',
          'last_seen_geo_source',
          'country_code',
          'region_code',
          'region_name',
          'city',
          'latitude',
          'longitude',
          'timezone',
          'geo_source',
        ].map(name => ({ name })),
      }
    }
    return { results: [] }
  }
}

function createPendingUser(scheduledAt: string): UserRow {
  return {
    id: 'user-1',
    email: 'owner@example.com',
    name: null,
    image: null,
    email_verified: null,
    email_state: 'verified',
    role: 'user',
    locale: 'zh',
    status: 'deletion_pending',
    merged_to_user_id: null,
    merged_at: null,
    merged_by_user_id: null,
    disabled_at: null,
    deletion_requested_at: '2026-06-01T00:00:00.000Z',
    deletion_scheduled_at: scheduledAt,
    deletion_cancelled_at: null,
    deletion_terms_version: '2026-06-22',
    privacy_analytics: 1,
    privacy_crash_reports: 1,
    privacy_usage_data: 0,
    privacy_personalization: 1,
    allow_cli_ip_mismatch: 0,
    created_at: '2026-06-01T00:00:00.000Z',
  }
}

function createEvent(db: MockD1Database) {
  return {
    context: {
      cloudflare: { env: { DB: db } },
    },
    node: { req: { headers: {} } },
  } as any
}

describe('pending account deletion recovery', () => {
  it('restores deletion_pending users when login happens within the 30-day window', async () => {
    const db = new MockD1Database()
    db.users.set('user-1', createPendingUser(new Date(Date.now() + 60_000).toISOString()))

    const { restorePendingDeletionIfWithinWindow } = await import('../authStore')
    const restored = await restorePendingDeletionIfWithinWindow(createEvent(db), 'user-1')

    expect(restored?.status).toBe('active')
    expect(restored?.deletionRequestedAt).toBeNull()
    expect(restored?.deletionScheduledAt).toBeNull()
    expect(restored?.deletionCancelledAt).toBeTruthy()
    expect(restored?.deletionTermsVersion).toBeNull()
  })

  it('keeps deletion_pending users pending after the 30-day window expires', async () => {
    const db = new MockD1Database()
    db.users.set('user-1', createPendingUser(new Date(Date.now() - 60_000).toISOString()))

    const { restorePendingDeletionIfWithinWindow } = await import('../authStore')
    const restored = await restorePendingDeletionIfWithinWindow(createEvent(db), 'user-1')

    expect(restored?.status).toBe('deletion_pending')
    expect(restored?.deletionRequestedAt).toBe('2026-06-01T00:00:00.000Z')
    expect(restored?.deletionScheduledAt).toBeTruthy()
    expect(restored?.deletionCancelledAt).toBeNull()
  })
})
