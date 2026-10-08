import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createSqliteD1, type SqliteD1Database } from '../../../test/helpers/d1-sqlite'

/** Device-auth risk controls against real SQLite: the limiter's counts are the store's own SQL. */

vi.mock('../cloudflare', async importOriginal => ({
  ...(await importOriginal<typeof import('../cloudflare')>()),
  readCloudflareBindings: (event: any) => event.context.cloudflare.env,
}))

let sqlite: SqliteD1Database
let store: typeof import('../authStore')

function createEvent(ip = '203.0.113.10') {
  return {
    context: { cloudflare: { env: { DB: sqlite } } },
    node: {
      req: {
        headers: {
          'cf-connecting-ip': ip,
          'cf-ipcountry': 'US',
          'cf-region-code': 'CA',
          'cf-ipcity': 'San Francisco',
          'user-agent': 'vitest',
        },
      },
    },
  } as any
}

function seedUser(id: string) {
  sqlite.sqlite.prepare(`INSERT INTO auth_users (id, email, status, created_at) VALUES (?, ?, 'active', ?)`)
    .run(id, `${id}@example.test`, new Date().toISOString())
}

function seedDevice(id: string, userId: string, trustedAt: string | null) {
  sqlite.sqlite.prepare(`INSERT INTO auth_devices (id, user_id, trusted_at, created_at) VALUES (?, ?, ?, ?)`)
    .run(id, userId, trustedAt, new Date().toISOString())
}

function seedLogin(userId: string) {
  sqlite.sqlite.prepare(`
    INSERT INTO auth_login_history (id, user_id, success, country_code, region_code, city, created_at)
    VALUES (?, ?, 1, 'US', 'CA', 'San Francisco', ?)
  `).run(crypto.randomUUID(), userId, new Date().toISOString())
}

beforeEach(async () => {
  vi.resetModules()
  store = await import('../authStore')
  sqlite = createSqliteD1()
  await store.getUserById(createEvent(), 'warm')
})

describe('device auth risk controls', () => {
  it('allows a device with no recent audits', async () => {
    const decision = await store.evaluateDeviceAuthRateLimit(createEvent(), { deviceId: 'device-0', userId: 'user-0' })
    expect(decision).toMatchObject({ allowed: true, reason: null, scope: null })
  })

  it('blocks device auth requests when device scoped rate limit is exceeded', async () => {
    const event = createEvent()

    for (let i = 0; i < 6; i++) {
      await store.recordDeviceAuthAudit(event, {
        action: 'request',
        status: 'success',
        deviceId: 'device-1',
        clientType: 'cli',
      })
    }

    const decision = await store.evaluateDeviceAuthRateLimit(event, { deviceId: 'device-1' })

    expect(decision.allowed).toBe(false)
    expect(decision.reason).toBe('rate_limited')
    expect(decision.scope).toBe('device')
    expect(decision.count).toBe(6)
    expect(decision.retryAfterSeconds).toBeGreaterThan(0)
  })

  it('reports the first scope that trips, in check order', async () => {
    // Twelve requests from one IP across devices trip the IP scope, not the device one.
    for (let i = 0; i < 12; i++)
      await store.recordDeviceAuthAudit(createEvent(), { action: 'request', status: 'success', deviceId: `device-${i}`, clientType: 'cli' })

    const decision = await store.evaluateDeviceAuthRateLimit(createEvent(), { deviceId: 'device-new' })
    expect(decision).toMatchObject({ allowed: false, reason: 'rate_limited', scope: 'ip', count: 12 })

    const elsewhere = await store.evaluateDeviceAuthRateLimit(createEvent('198.51.100.1'), { deviceId: 'device-new' })
    expect(elsewhere.allowed).toBe(true)
  })

  it('enters cooldown after repeated reject or cancel audit records', async () => {
    const event = createEvent()

    for (let i = 0; i < 3; i++) {
      await store.recordDeviceAuthAudit(event, {
        action: i === 0 ? 'cancel' : 'reject',
        status: i === 0 ? 'success' : 'blocked',
        userId: 'user-1',
        deviceId: 'device-2',
        clientType: 'cli',
        reason: 'test',
      })
    }

    const decision = await store.evaluateDeviceAuthRateLimit(event, { deviceId: 'device-2', userId: 'user-1' })

    expect(decision.allowed).toBe(false)
    expect(decision.reason).toBe('cooldown')
    expect(decision.scope).toBe('device_cooldown')
  })

  it('requires a fresh signed browser session for long-term device authorization', async () => {
    seedUser('user-2')
    seedDevice('device-3', 'user-2', new Date().toISOString())
    seedLogin('user-2')
    const event = createEvent()

    const stale = await store.evaluateDeviceAuthLongTermPolicy(event, 'user-2', 'device-3', {
      sessionIssuedAt: Math.floor((Date.now() - 11 * 60 * 1000) / 1000),
    })
    const fresh = await store.evaluateDeviceAuthLongTermPolicy(event, 'user-2', 'device-3', {
      sessionIssuedAt: Math.floor(Date.now() / 1000),
    })

    expect(stale.allowLongTerm).toBe(false)
    expect(stale.reason).toBe('session_window')
    expect(fresh.allowLongTerm).toBe(true)
    expect(fresh.reason).toBeNull()
  })

  it('requires an explicitly trusted device for long-term device authorization', async () => {
    seedUser('user-3')
    seedDevice('device-4', 'user-3', null)
    seedLogin('user-3')
    const event = createEvent()

    const policy = await store.evaluateDeviceAuthLongTermPolicy(event, 'user-3', 'device-4', {
      sessionIssuedAt: Math.floor(Date.now() / 1000),
    })

    expect(policy.allowLongTerm).toBe(false)
    expect(policy.deviceTrusted).toBe(false)
    expect(policy.reason).toBe('device')
  })
})
