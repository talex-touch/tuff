import type { SqliteD1Database, SqliteD1Statement } from '../../test/helpers/d1-sqlite'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSqliteD1 } from '../../test/helpers/d1-sqlite'

/** Sync sessions and pulls against real SQLite: what a page returns, what it records, in how many round trips. */

let store: typeof import('./syncStoreV1')
let d1: SqliteD1Database

function eventFor(db: unknown = d1) {
  return { context: { cloudflare: { env: { DB: db } } }, node: { req: { headers: {} } } } as any
}

/** Counts round trips: one per statement run on its own, one per batch. */
function countingD1(inner: SqliteD1Database) {
  let roundTrips = 0
  const wrap = (statement: SqliteD1Statement): SqliteD1Statement => new Proxy(statement, {
    get(target, property, receiver) {
      if (property === 'bind')
        return (...values: unknown[]) => wrap(target.bind(...values))
      if (property === 'first' || property === 'all' || property === 'run') {
        return (...args: unknown[]) => {
          roundTrips += 1
          return (target as any)[property](...args)
        }
      }
      return Reflect.get(target, property, receiver)
    },
  })
  const db = {
    prepare: (sql: string) => wrap(inner.prepare(sql)),
    batch: async (statements: SqliteD1Statement[]) => {
      roundTrips += 1
      return inner.batch(statements)
    },
  }
  return { db, roundTrips: () => roundTrips }
}

function seedChanges(userId: string, count: number) {
  for (let index = 0; index < count; index += 1) {
    const itemId = `item-${index}`
    d1.sqlite.prepare(`
      INSERT INTO sync_items_v1 (user_id, item_id, type, schema_version, payload_enc, updated_at)
      VALUES (?, ?, 'note', 1, 'x', '2026-10-01T00:00:00.000Z')
    `).run(userId, itemId)
    d1.sqlite.prepare(`
      INSERT INTO sync_oplog_v1 (user_id, device_id, op_seq, op_hash, item_id, op_type, updated_at)
      VALUES (?, 'device-a', ?, ?, ?, 'upsert', '2026-10-01T00:00:00.000Z')
    `).run(userId, index + 1, `hash-${index}`, itemId)
  }
}

function session(userId: string, deviceId: string) {
  return d1.sqlite.prepare(`SELECT last_cursor, last_pull_at, last_error_code FROM sync_sessions_v1 WHERE user_id = ? AND device_id = ?`).get(userId, deviceId)
}

beforeEach(async () => {
  vi.resetModules()
  store = await import('./syncStoreV1')
  d1 = createSqliteD1()
  // Creates the sync tables.
  await store.handshakeSyncSession(eventFor(), 'warm-user', 'warm-device')
})

afterEach(() => {
  d1.close()
})

describe('handshakeSyncSession', () => {
  it('opens a session at the server cursor in one statement, and reopens it there', async () => {
    seedChanges('user-1', 3)
    const counting = countingD1(d1)

    const first = await store.handshakeSyncSession(eventFor(counting.db), 'user-1', 'device-b')
    seedChanges('user-1', 0)
    const again = await store.handshakeSyncSession(eventFor(counting.db), 'user-1', 'device-b')

    expect(counting.roundTrips()).toBe(3) // the schema record, then one statement each
    expect([first.serverCursor, again.serverCursor]).toEqual([3, 3])
    expect(again.syncToken).not.toBe(first.syncToken)
    expect(await store.getSyncSession(eventFor(), 'user-1', 'device-b', again.syncToken)).toMatchObject({ syncToken: again.syncToken })
    expect((await store.handshakeSyncSession(eventFor(), 'user-2', 'device-b')).serverCursor).toBe(0)
  })
})

describe('pullSyncItemsV1', () => {
  it('returns a page with its items and records the page\'s last cursor, in one round trip', async () => {
    seedChanges('user-1', 5)
    await store.handshakeSyncSession(eventFor(), 'user-1', 'device-b')
    const counting = countingD1(d1)
    await store.getSyncSession(eventFor(counting.db), 'user-1', 'device-b', 'x').catch(() => {}) // reads the schema record
    const before = counting.roundTrips()

    const page = await store.pullSyncItemsV1(eventFor(counting.db), 'user-1', 'device-b', 1, 3)

    expect(counting.roundTrips() - before).toBe(1)
    expect(page.oplog.map(entry => entry.cursor)).toEqual([2, 3, 4])
    expect(page.items.map(item => item.item_id).sort()).toEqual(['item-1', 'item-2', 'item-3'])
    expect(page.nextCursor).toBe(4)
    expect(session('user-1', 'device-b')).toMatchObject({ last_cursor: 4, last_error_code: null, last_pull_at: expect.any(String) })
  })

  it('keeps the cursor it was given when there is nothing new', async () => {
    seedChanges('user-1', 2)
    await store.handshakeSyncSession(eventFor(), 'user-1', 'device-b')

    const page = await store.pullSyncItemsV1(eventFor(), 'user-1', 'device-b', 2, 200)

    expect(page).toEqual({ items: [], oplog: [], nextCursor: 2 })
    expect(session('user-1', 'device-b')).toMatchObject({ last_cursor: 2 })
  })

  it('pulls a default page that touches more items than one statement may bind parameters', async () => {
    seedChanges('user-1', 150)
    await store.handshakeSyncSession(eventFor(), 'user-1', 'device-b')

    const page = await store.pullSyncItemsV1(eventFor(), 'user-1', 'device-b', 0, 200)

    expect(page.oplog).toHaveLength(150)
    expect(page.items).toHaveLength(150)
    expect(page.nextCursor).toBe(150)
  })
})
