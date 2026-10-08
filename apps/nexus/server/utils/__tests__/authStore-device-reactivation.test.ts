import type { D1Database } from '@cloudflare/workers-types'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSqliteD1, type SqliteD1Database, type SqliteD1Statement } from '../../../test/helpers/d1-sqlite'

/**
 * The request's device, recorded by one statement against real SQLite: reactivation, hand-over to a
 * new owner, trust for a user's only active device, the throttle that keeps ordinary requests from
 * writing, and the single round trip that reads the user and records the device together.
 */

vi.mock('../cloudflare', async importOriginal => ({
  ...(await importOriginal<typeof import('../cloudflare')>()),
  readCloudflareBindings: (event: any) => event.context.cloudflare?.env,
}))

const START = new Date('2026-05-18T03:00:00.000Z')

let sqlite: SqliteD1Database
let store: typeof import('../authStore')

function createEvent(db: unknown, headers: Record<string, string> = {}) {
  return {
    context: { cloudflare: { env: { DB: db } } },
    node: { req: { headers: { 'user-agent': 'vitest', 'x-forwarded-for': '203.0.113.10', ...headers } } },
  } as any
}

function seedUser(id: string, status = 'active') {
  sqlite.sqlite.prepare(`INSERT INTO auth_users (id, email, status, created_at) VALUES (?, ?, ?, ?)`)
    .run(id, `${id}@example.test`, status, START.toISOString())
}

function seedDevice(row: Record<string, string | number | null>) {
  const columns = Object.keys(row)
  sqlite.sqlite.prepare(`INSERT INTO auth_devices (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`)
    .run(...Object.values(row))
}

function deviceRow(id: string) {
  return sqlite.sqlite.prepare('SELECT * FROM auth_devices WHERE id = ?').get(id) as Record<string, any> | undefined
}

/** Counts round trips (a batch is one) and writes to `auth_devices`. */
function countingD1(inner: SqliteD1Database) {
  const stats = { roundTrips: 0, deviceWrites: 0 }
  const wrap = (statement: SqliteD1Statement): SqliteD1Statement => new Proxy(statement, {
    get(target, property, receiver) {
      if (property === 'bind')
        return (...values: unknown[]) => wrap(target.bind(...values))
      if (property === 'first' || property === 'all' || property === 'run') {
        return async (...args: unknown[]) => {
          stats.roundTrips += 1
          const result = await (target as any)[property](...args)
          if (target.sql.includes('INSERT INTO auth_devices') && (property === 'run' ? result.meta.changes : result))
            stats.deviceWrites += 1
          return result
        }
      }
      return Reflect.get(target, property, receiver)
    },
  })
  const db = {
    prepare: (sql: string) => wrap(inner.prepare(sql)),
    batch: async (statements: SqliteD1Statement[]) => {
      stats.roundTrips += 1
      const results = await inner.batch(statements)
      statements.forEach((statement, index) => {
        if (statement.sql.includes('INSERT INTO auth_devices') && results[index]!.meta.changes > 0)
          stats.deviceWrites += 1
      })
      return results
    },
  }
  return { db: db as unknown as D1Database, stats }
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(START)
  vi.resetModules()
  store = await import('../authStore')
  sqlite = createSqliteD1()
  // Any store call creates the auth tables through the schema gate.
  await store.getUserById(createEvent(sqlite), 'nobody')
  seedUser('user-1')
  seedUser('user-2')
})

afterEach(() => {
  vi.useRealTimers()
})

const REVOKED_CLI = {
  id: 'device-1',
  user_id: 'user-1',
  device_name: 'Old CLI',
  platform: 'darwin-arm64',
  client_type: 'cli',
  trusted_at: null,
  user_agent: 'old',
  last_seen_at: '2026-05-18T00:00:00.000Z',
  last_seen_ip: '203.0.113.10',
  created_at: '2026-05-18T00:00:00.000Z',
  revoked_at: '2026-05-18T01:00:00.000Z',
  token_version: 2,
}

describe('auth device reactivation', () => {
  it('does not reactivate a revoked device during regular device upsert', async () => {
    seedDevice(REVOKED_CLI)

    const device = await store.upsertDevice(createEvent(sqlite), 'user-1', 'device-1', {
      deviceName: 'New CLI',
      platform: 'darwin-arm64',
      clientType: 'cli',
    })

    expect(device.revokedAt).toBe('2026-05-18T01:00:00.000Z')
    expect(device.tokenVersion).toBe(2)
    expect(device.deviceName).toBe('New CLI')
    expect(device.trustedAt).toBeNull()
  })

  it('reactivates a revoked device and rotates token version on browser re-login', async () => {
    seedDevice(REVOKED_CLI)

    const device = await store.upsertDevice(createEvent(sqlite), 'user-1', 'device-1', {
      deviceName: 'New CLI',
      platform: 'darwin-arm64',
      clientType: 'cli',
      reactivateRevoked: true,
    })

    expect(device.revokedAt).toBeNull()
    expect(device.tokenVersion).toBe(3)
    expect(device.deviceName).toBe('New CLI')
    // Active again and the user's only active device: trusted, as the old COUNT step did.
    expect(device.trustedAt).toBe(START.toISOString())
  })

  it('moves a reused global device id to the current user without inheriting previous trust timestamp or revoked state', async () => {
    seedDevice({
      ...REVOKED_CLI,
      device_name: 'Old Browser',
      platform: 'MacIntel',
      client_type: 'app',
      trusted_at: '2026-05-18T01:00:00.000Z',
      revoked_at: '2026-05-18T02:00:00.000Z',
      token_version: 4,
    })

    const device = await store.upsertDevice(createEvent(sqlite), 'user-2', 'device-1', {
      deviceName: 'New Browser',
      platform: 'MacIntel',
    })

    expect(device.userId).toBe('user-2')
    expect(device.deviceName).toBe('New Browser')
    // Replaced, not merged: the new owner's request named no client type.
    expect(device.clientType).toBeNull()
    expect(device.trustedAt).toBe(START.toISOString())
    expect(device.revokedAt).toBeNull()
    expect(device.tokenVersion).toBe(5)
    expect(device.createdAt).toBe(START.toISOString())
  })

  it('keeps metadata the request omits for the same owner and overwrites last-seen', async () => {
    seedDevice({ ...REVOKED_CLI, revoked_at: null, trusted_at: '2026-05-18T00:30:00.000Z' })

    const device = await store.upsertDevice(createEvent(sqlite, { 'x-forwarded-for': '198.51.100.7' }), 'user-1', 'device-1', {})

    expect(device.deviceName).toBe('Old CLI')
    expect(device.platform).toBe('darwin-arm64')
    expect(device.lastSeenAt).toBe(START.toISOString())
    expect(device.lastSeenIp).toBe('198.51.100.7')
    expect(device.trustedAt).toBe('2026-05-18T00:30:00.000Z')
    expect(device.createdAt).toBe('2026-05-18T00:00:00.000Z')
  })
})

describe('device trust', () => {
  it('trusts a user\'s first active device, not the second, and the remaining one once the other is revoked', async () => {
    await store.touchDevice(createEvent(sqlite), 'user-1', 'device-a', {})
    await store.touchDevice(createEvent(sqlite), 'user-1', 'device-b', {})
    expect(deviceRow('device-a')?.trusted_at).toBe(START.toISOString())
    expect(deviceRow('device-b')?.trusted_at).toBeNull()

    sqlite.sqlite.prepare(`UPDATE auth_devices SET revoked_at = ? WHERE id = 'device-a'`).run(START.toISOString())
    vi.setSystemTime(new Date(START.getTime() + 60_000))
    // Inside the throttle window, yet trust changes, so it writes.
    await store.touchDevice(createEvent(sqlite), 'user-1', 'device-b', {})
    expect(deviceRow('device-b')?.trusted_at).toBe(new Date(START.getTime() + 60_000).toISOString())
  })
})

describe('device touch throttle', () => {
  it('writes the first time, then not again within five minutes unless something changed', async () => {
    const { db, stats } = countingD1(sqlite)
    const touch = (headers: Record<string, string> = {}, data = {}) =>
      store.touchDevice(createEvent(db, headers), 'user-1', 'device-1', data)

    await touch()
    expect(stats.deviceWrites).toBe(1)

    vi.setSystemTime(new Date(START.getTime() + 4 * 60_000))
    await touch()
    expect(stats.deviceWrites).toBe(1)
    expect(deviceRow('device-1')?.last_seen_at).toBe(START.toISOString())

    await touch({ 'x-forwarded-for': '198.51.100.7' })
    expect(stats.deviceWrites).toBe(2)

    await touch({ 'x-forwarded-for': '198.51.100.7' }, { deviceName: 'Renamed' })
    expect(stats.deviceWrites).toBe(3)

    vi.setSystemTime(new Date(START.getTime() + 15 * 60_000))
    await touch({ 'x-forwarded-for': '198.51.100.7' }, { deviceName: 'Renamed' })
    expect(stats.deviceWrites).toBe(4)
    expect(deviceRow('device-1')?.last_seen_at).toBe(new Date(START.getTime() + 15 * 60_000).toISOString())
  })

  it('hands a device over to a new owner even inside the window', async () => {
    await store.touchDevice(createEvent(sqlite), 'user-1', 'device-1', {})
    await store.touchDevice(createEvent(sqlite), 'user-2', 'device-1', {})
    expect(deviceRow('device-1')).toMatchObject({ user_id: 'user-2', token_version: 1 })
  })

  it('records one row for concurrent first requests from a new device', async () => {
    await Promise.all(Array.from({ length: 5 }, () => store.touchDevice(createEvent(sqlite), 'user-1', 'device-1', {})))
    expect(sqlite.sqlite.prepare(`SELECT COUNT(*) AS n FROM auth_devices WHERE id = 'device-1'`).get()).toEqual({ n: 1 })
  })

  it('writes nothing for a user that is not active', async () => {
    seedUser('user-off', 'disabled')
    await store.touchDevice(createEvent(sqlite), 'user-off', 'device-off', {})
    expect(deviceRow('device-off')).toBeUndefined()
  })
})

describe('getUserAndTouchRequestDevice', () => {
  it('reads the user and records the device in one round trip', async () => {
    const { db, stats } = countingD1(sqlite)
    await store.getUserById(createEvent(db), 'warm-the-schema-gate')
    const before = stats.roundTrips

    const result = await store.getUserAndTouchRequestDevice(createEvent(db, { 'x-device-id': 'device-9', 'x-device-name': 'Browser' }), 'user-1')

    expect(stats.roundTrips - before).toBe(1)
    expect(result.user?.id).toBe('user-1')
    expect(result.deviceId).toBe('device-9')
    expect(deviceRow('device-9')).toMatchObject({ user_id: 'user-1', device_name: 'Browser' })
  })

  it('returns no device and records none for a disabled user', async () => {
    seedUser('user-off', 'disabled')
    const result = await store.getUserAndTouchRequestDevice(createEvent(sqlite, { 'x-device-id': 'device-9' }), 'user-off')
    expect(result.user?.status).toBe('disabled')
    expect(result.deviceId).toBeNull()
    expect(deviceRow('device-9')).toBeUndefined()
  })
})
