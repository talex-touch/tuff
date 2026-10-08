import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSqliteD1, type SqliteD1Database, type SqliteD1Statement } from '../../../test/helpers/d1-sqlite'

/** Revoking a user's inactive devices against real SQLite: which go, in what order, and the count left. */

vi.mock('../cloudflare', async importOriginal => ({
  ...(await importOriginal<typeof import('../cloudflare')>()),
  readCloudflareBindings: (event: any) => event.context.cloudflare?.env,
}))

let sqlite: SqliteD1Database
let store: typeof import('../authStore')

function eventFor(db: unknown = sqlite) {
  return { context: { cloudflare: { env: { DB: db } } }, node: { req: { headers: {} } } } as any
}

function seedDevice(id: string, userId: string, lastSeenAt: string | null, createdAt: string, revokedAt: string | null = null) {
  sqlite.sqlite.prepare(`INSERT INTO auth_devices (id, user_id, device_name, platform, last_seen_at, created_at, revoked_at) VALUES (?, ?, ?, 'macos', ?, ?, ?)`)
    .run(id, userId, `name-${id}`, lastSeenAt, createdAt, revokedAt)
}

function device(id: string) {
  return sqlite.sqlite.prepare('SELECT revoked_at, token_version FROM auth_devices WHERE id = ?').get(id) as { revoked_at: string | null, token_version: number }
}

beforeEach(async () => {
  vi.resetModules()
  store = await import('../authStore')
  sqlite = createSqliteD1()
  await store.getUserById(eventFor(), 'warm')
  for (const id of ['u1', 'u2'])
    sqlite.sqlite.prepare(`INSERT INTO auth_users (id, email, status, created_at) VALUES (?, ?, 'active', '2026-01-01T00:00:00.000Z')`).run(id, `${id}@x.test`)
  seedDevice('current', 'u1', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')
  seedDevice('stale-b', 'u1', '2026-03-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')
  seedDevice('stale-a', 'u1', null, '2026-02-01T00:00:00.000Z')
  seedDevice('active', 'u1', '2026-09-30T00:00:00.000Z', '2026-01-01T00:00:00.000Z')
  seedDevice('gone', 'u1', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', '2026-05-01T00:00:00.000Z')
  seedDevice('other-user', 'u2', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')
})

afterEach(() => {
  sqlite.close()
})

describe('revokeInactiveDevicesAndCountActive', () => {
  it('revokes the inactive devices but the current one, longest unseen first, and counts the rest in one round trip', async () => {
    let roundTrips = 0
    const counting = {
      prepare: (sql: string) => sqlite.prepare(sql),
      batch: async (statements: SqliteD1Statement[]) => {
        roundTrips += 1
        return sqlite.batch(statements)
      },
    }
    await store.getUserById(eventFor(counting), 'warm') // reads the schema record

    const result = await store.revokeInactiveDevicesAndCountActive(eventFor(counting), 'u1', {
      inactiveBefore: '2026-09-01T00:00:00.000Z',
      keepDeviceId: 'current',
    })

    expect(roundTrips).toBe(1)
    expect(result.evicted.map(item => item.id)).toEqual(['stale-a', 'stale-b'])
    expect(result.evicted[1]).toEqual({ id: 'stale-b', deviceName: 'name-stale-b', platform: 'macos', lastSeenAt: '2026-03-01T00:00:00.000Z' })
    expect(result.activeCount).toBe(2)
    expect(device('stale-a')).toMatchObject({ revoked_at: expect.any(String), token_version: 1 })
    expect(device('current')).toEqual({ revoked_at: null, token_version: 0 })
    expect(device('gone')).toMatchObject({ token_version: 0 })
    expect(device('other-user')).toEqual({ revoked_at: null, token_version: 0 })
  })

  it('only counts when there is no cutoff', async () => {
    const result = await store.revokeInactiveDevicesAndCountActive(eventFor(), 'u1', { inactiveBefore: '' })

    expect(result).toEqual({ evicted: [], activeCount: 4 })
  })
})
