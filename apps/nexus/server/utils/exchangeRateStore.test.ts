import type { H3Event } from 'h3'
import type { SqliteD1Database, SqliteD1Statement } from '../../test/helpers/d1-sqlite'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSqliteD1 } from '../../test/helpers/d1-sqlite'

/** Exchange-rate snapshots against real SQLite: what a refresh writes, and in how many round trips. */

vi.mock('nitropack/runtime/internal/storage', () => {
  const items = new Map<string, unknown>()
  return {
    useStorage: () => ({
      getItem: async (key: string) => items.get(key) ?? null,
      setItem: async (key: string, value: unknown) => {
        items.set(key, value)
      },
    }),
  }
})

let store: typeof import('./exchangeRateStore')
let d1: SqliteD1Database

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

function eventFor(db: unknown = d1): H3Event {
  return { context: { cloudflare: { env: { DB: db } } } } as unknown as H3Event
}

const RATES: Record<string, number> = Object.fromEntries(
  Array.from({ length: 160 }, (_, index) => [`C${String(index).padStart(2, '0')}`, 1 + index / 1000]),
)

function snapshot(id: string, fetchedAt: number, rates: Record<string, number> = RATES) {
  return {
    id,
    baseCurrency: 'USD',
    fetchedAt,
    providerUpdatedAt: fetchedAt - 1000,
    providerNextUpdateAt: fetchedAt + 1000,
    payload: { result: 'success' },
    rates,
  }
}

beforeEach(async () => {
  vi.resetModules()
  store = await import('./exchangeRateStore')
  d1 = createSqliteD1()
})

afterEach(() => {
  d1.close()
})

describe('saveSnapshotWithRates', () => {
  it('writes the snapshot and a row per rate in one round trip', async () => {
    const counting = countingD1(d1)
    // Creates the tables and reads the schema record.
    await store.saveSnapshotWithRates(eventFor(counting.db), snapshot('warm', 1_600_000_000_000, {}))
    const before = counting.roundTrips()

    await store.saveSnapshotWithRates(eventFor(counting.db), snapshot('snap-1', 1_700_000_000_000))

    expect(counting.roundTrips() - before).toBe(1)
    const rows = d1.sqlite.prepare(`SELECT id, base_currency, target_currency, rate, fetched_at, provider_updated_at FROM exchange_rate_rates ORDER BY target_currency`).all() as Array<Record<string, unknown>>
    expect(rows).toHaveLength(160)
    expect(rows[1]).toMatchObject({ base_currency: 'USD', target_currency: 'C01', rate: 1.001, fetched_at: 1_700_000_000_000, provider_updated_at: 1_699_999_999_000 })
    expect(new Set(rows.map(row => row.id)).size).toBe(160)
    expect((await store.getLatestSnapshot(eventFor(), 'USD'))?.id).toBe('snap-1')
  })

  it('writes neither the snapshot nor its rates when the rates cannot be written', async () => {
    // Creates the tables.
    await store.cleanupHistory(eventFor(), { retentionDays: 1 })
    d1.sqlite.exec(`CREATE TRIGGER fail_rates BEFORE INSERT ON exchange_rate_rates BEGIN SELECT RAISE(ABORT, 'rates are down'); END;`)

    await expect(store.saveSnapshotWithRates(eventFor(), snapshot('snap-1', 1_700_000_000_000))).rejects.toThrow(/rates are down/)

    expect(d1.sqlite.prepare(`SELECT COUNT(*) AS n FROM exchange_rate_snapshots`).get()).toEqual({ n: 0 })
  })
})

describe('claimSnapshotRefresh', () => {
  it('lets one request refresh a stale snapshot at a time', async () => {
    const now = Date.UTC(2026, 9, 15, 8)

    expect(await store.claimSnapshotRefresh(eventFor({ prepare: (sql: string) => d1.prepare(sql), batch: (s: any[]) => d1.batch(s) }), 'USD', now)).toBe(true)
    expect(await store.claimSnapshotRefresh(eventFor({ prepare: (sql: string) => d1.prepare(sql), batch: (s: any[]) => d1.batch(s) }), 'USD', now + 5_000)).toBe(false)
    expect(await store.claimSnapshotRefresh(eventFor(), 'USD', now + 60_000)).toBe(true)
  })
})

describe('cleanupHistory', () => {
  it('drops snapshots and rates older than the retention window', async () => {
    const now = Date.now()
    const day = 24 * 60 * 60 * 1000
    await store.saveSnapshotWithRates(eventFor(), snapshot('old', now - 10 * day, { CNY: 7 }))
    await store.saveSnapshotWithRates(eventFor(), snapshot('new', now - day, { CNY: 7.1 }))

    await store.cleanupHistory(eventFor(), { retentionDays: 5 })

    expect(d1.sqlite.prepare(`SELECT id FROM exchange_rate_snapshots`).all()).toEqual([{ id: 'new' }])
    expect(d1.sqlite.prepare(`SELECT rate FROM exchange_rate_rates`).all()).toEqual([{ rate: 7.1 }])
  })
})
