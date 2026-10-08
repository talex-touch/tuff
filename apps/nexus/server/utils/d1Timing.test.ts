import type { D1Database } from '@cloudflare/workers-types'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSqliteD1 } from '../../test/helpers/d1-sqlite'
import { createD1RequestTiming, formatD1ServerTiming, instrumentD1Database, runWithD1Timing } from './d1Timing'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('instrumentD1Database', () => {
  it('counts a statement run on its own, and a batch however many it carries, as one round trip each', async () => {
    const sqlite = createSqliteD1()
    const db = sqlite as unknown as D1Database
    expect(instrumentD1Database(db)).toBe(true)

    const timing = createD1RequestTiming()
    const row = await runWithD1Timing(timing, async () => {
      await db.prepare(`CREATE TABLE widgets (id TEXT PRIMARY KEY, name TEXT)`).run()
      await db.batch([
        db.prepare(`INSERT INTO widgets (id, name) VALUES (?1, ?2)`).bind('a', 'Alpha'),
        db.prepare(`INSERT INTO widgets (id, name) VALUES (?1, ?2)`).bind('b', 'Beta'),
      ])
      const all = await db.prepare(`SELECT id FROM widgets ORDER BY id`).all()
      expect(all.results).toEqual([{ id: 'a' }, { id: 'b' }])
      return db.prepare(`SELECT name FROM widgets WHERE id = ?1`).bind('b').first<{ name: string }>()
    })

    expect(row).toEqual({ name: 'Beta' })
    expect(timing.roundTrips).toBe(4)
  })

  it('keeps concurrent requests\' counts apart and counts nothing outside a timed request', async () => {
    const sqlite = createSqliteD1()
    const db = sqlite as unknown as D1Database
    instrumentD1Database(db)
    await db.prepare(`CREATE TABLE widgets (id TEXT PRIMARY KEY)`).run()

    const first = createD1RequestTiming()
    const second = createD1RequestTiming()
    await Promise.all([
      runWithD1Timing(first, async () => {
        for (let index = 0; index < 3; index += 1)
          await db.prepare(`SELECT COUNT(*) AS n FROM widgets`).first()
      }),
      runWithD1Timing(second, async () => {
        await db.prepare(`INSERT INTO widgets (id) VALUES ('x')`).run()
      }),
    ])

    expect(first.roundTrips).toBe(3)
    expect(second.roundTrips).toBe(1)
  })

  it('is applied once per binding, however many requests instrument it', async () => {
    const sqlite = createSqliteD1()
    const db = sqlite as unknown as D1Database
    instrumentD1Database(db)
    instrumentD1Database(db)

    const timing = createD1RequestTiming()
    await runWithD1Timing(timing, () => db.prepare(`SELECT 1 AS one`).first())

    expect(timing.roundTrips).toBe(1)
  })

  it('counts wall time with any call in flight, not the sum of parallel calls', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(1_000)
    const pending = new Map<string, ReturnType<typeof deferred<unknown>>>()
    const statement = (sql: string) => ({
      bind: () => statement(sql),
      first: () => {
        const call = deferred<unknown>()
        pending.set(sql, call)
        return call.promise
      },
    })
    const db = { prepare: (sql: string) => statement(sql) } as unknown as D1Database
    instrumentD1Database(db)

    const timing = createD1RequestTiming()
    const request = runWithD1Timing(timing, async () => {
      await Promise.all([db.prepare('a').first(), db.prepare('b').first()])
      await db.prepare('c').first()
    })
    await Promise.resolve()

    vi.setSystemTime(1_100)
    pending.get('a')!.resolve(null)
    await Promise.resolve()
    vi.setSystemTime(1_150)
    pending.get('b')!.resolve(null)
    await vi.waitFor(() => expect(pending.has('c')).toBe(true))
    vi.setSystemTime(1_200)
    pending.get('c')!.resolve(null)
    await request

    expect(timing.roundTrips).toBe(3)
    // a and b overlap from 1000 to 1150, then c runs from 1150 to 1200.
    expect(timing.busyMs).toBe(200)
    expect(formatD1ServerTiming(timing, 1_250)).toBe('d1;desc="3 round trips";dur=200, app;dur=250')
  })

  it('leaves a binding that will not take new methods untouched and working', async () => {
    const sqlite = createSqliteD1()
    const frozen = Object.freeze({
      prepare: (sql: string) => sqlite.prepare(sql),
      batch: (statements: any[]) => sqlite.batch(statements),
    }) as unknown as D1Database

    expect(instrumentD1Database(frozen)).toBe(false)
    await expect(frozen.prepare(`SELECT 1 AS one`).first()).resolves.toEqual({ one: 1 })
  })
})

describe('formatD1ServerTiming', () => {
  it('reports a call still in flight up to now', () => {
    const timing = createD1RequestTiming(0)
    timing.roundTrips = 1
    timing.inFlight = 1
    timing.busySince = 40
    expect(formatD1ServerTiming(timing, 100)).toBe('d1;desc="1 round trip";dur=60, app;dur=100')
  })
})
