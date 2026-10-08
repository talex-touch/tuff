import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createSqliteD1, type SqliteD1Database } from '../../../test/helpers/d1-sqlite'

vi.mock('../cloudflare', async importOriginal => ({
  ...(await importOriginal<typeof import('../cloudflare')>()),
  readCloudflareBindings: (event: any) => event.context.cloudflare?.env,
}))

let sqlite: SqliteD1Database
let store: typeof import('../authStore')

function createEvent() {
  return { context: { cloudflare: { env: { DB: sqlite } } }, node: { req: { headers: {} } } } as any
}

function insertHistory(id: string, createdAt: string, userId = 'user-1') {
  sqlite.sqlite.prepare(`
    INSERT INTO auth_login_history (
      id, user_id, device_id, ip, user_agent, success, reason, client_type, created_at,
      country_code, region_code, region_name, city, latitude, longitude, timezone, geo_source
    ) VALUES (?, ?, NULL, '203.0.113.42', 'vitest', 1, 'password', 'web', ?, 'US', 'CA', 'California', 'San Francisco', 37.7749, -122.4194, 'America/Los_Angeles', 'cf')
  `).run(id, userId, createdAt)
}

const daysAgo = (days: number) => new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

beforeEach(async () => {
  vi.resetModules()
  store = await import('../authStore')
  sqlite = createSqliteD1()
  await store.getUserById(createEvent(), 'warm')
})

describe('auth login history', () => {
  it('preserves web login client type and masks IP addresses', async () => {
    insertHistory('history-1', daysAgo(1))

    const records = await store.listLoginHistory(createEvent(), 'user-1')

    expect(records).toHaveLength(1)
    expect(records[0]).toMatchObject({
      id: 'history-1',
      client_type: 'web',
      ip: '203.0.113.42',
      ip_masked: '203.0.*.*',
      success: true,
    })
  })

  it('never lists rows past the window, and prunes them after the response rather than before the read', async () => {
    insertHistory('recent', daysAgo(1))
    insertHistory('expired', daysAgo(120))
    insertHistory('expired-other-user', daysAgo(120), 'user-2')

    const records = await store.listLoginHistory(createEvent(), 'user-1')
    expect(records.map(record => record.id)).toEqual(['recent'])

    await vi.waitFor(() => {
      const left = sqlite.sqlite.prepare('SELECT id FROM auth_login_history ORDER BY id').all()
      expect(left).toEqual([{ id: 'recent' }])
    })
  })
})
