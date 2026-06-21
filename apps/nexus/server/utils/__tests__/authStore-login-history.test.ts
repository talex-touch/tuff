import { describe, expect, it, vi } from 'vitest'
import { listLoginHistory } from '../authStore'

vi.mock('../cloudflare', () => ({
  readCloudflareBindings: (event: any) => event.context.cloudflare?.env,
}))

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

  async all() {
    return this.db.all(this.sql, this.args)
  }
}

class MockD1Database {
  readonly loginHistory = [{
    id: 'history-1',
    user_id: 'user-1',
    device_id: null,
    ip: '203.0.113.42',
    user_agent: 'vitest',
    success: 1,
    reason: 'password',
    client_type: 'web',
    created_at: '2026-06-21T10:00:00.000Z',
    country_code: 'US',
    region_code: 'CA',
    region_name: 'California',
    city: 'San Francisco',
    latitude: 37.7749,
    longitude: -122.4194,
    timezone: 'America/Los_Angeles',
    geo_source: 'cf',
  }]

  prepare(sql: string) {
    return new MockStatement(this, sql)
  }

  run(sql: string, args: any[]) {
    if (sql.includes('DELETE FROM auth_login_history')) {
      const [cutoff] = args
      const cutoffMs = new Date(cutoff).getTime()
      for (let index = this.loginHistory.length - 1; index >= 0; index--) {
        const createdAt = this.loginHistory[index]?.created_at
        if (createdAt && new Date(createdAt).getTime() < cutoffMs)
          this.loginHistory.splice(index, 1)
      }
    }
    return { meta: { changes: 0 } }
  }

  all(sql: string, args: any[] = []) {
    if (sql.includes('PRAGMA table_info')) {
      return { results: [{ name: 'client_type' }] }
    }
    if (sql.includes('SELECT * FROM auth_login_history')) {
      const [userId] = args
      return {
        results: this.loginHistory
          .filter(row => row.user_id === userId)
          .sort((a, b) => b.created_at.localeCompare(a.created_at)),
      }
    }
    return { results: [] }
  }
}

function createEvent(db: MockD1Database) {
  return {
    context: {
      cloudflare: {
        env: { DB: db },
      },
    },
    node: {
      req: {
        headers: {},
      },
    },
  } as any
}

describe('auth login history', () => {
  it('preserves web login client type and masks IP addresses', async () => {
    const records = await listLoginHistory(createEvent(new MockD1Database()), 'user-1')

    expect(records).toHaveLength(1)
    expect(records[0]).toMatchObject({
      id: 'history-1',
      client_type: 'web',
      ip: '203.0.113.42',
      ip_masked: '203.0.*.*',
      success: true,
    })
  })
})
