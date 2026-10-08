import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createSqliteD1, type SqliteD1Database } from '../../test/helpers/d1-sqlite'
import { recordTelemetryMessages } from './messageStore'

/** Telemetry messages against real SQLite, counting round trips: one per statement run alone, one per batch. */

type Statement = ReturnType<SqliteD1Database['prepare']>

let d1: SqliteD1Database
let db: SqliteD1Database
let roundTrips = 0

function countingStatement(statement: Statement): Statement {
  return new Proxy(statement, {
    get(target, key, receiver) {
      if (key === 'bind')
        return (...values: unknown[]) => countingStatement((target as any).bind(...values))
      if (key === 'first' || key === 'all' || key === 'run') {
        return (...args: unknown[]) => {
          roundTrips += 1
          return (target as any)[key](...args)
        }
      }
      return Reflect.get(target, key, receiver)
    },
  })
}

function countingBinding(target: SqliteD1Database): SqliteD1Database {
  return new Proxy(target, {
    get(inner, property, receiver) {
      if (property === 'batch') {
        return (...args: Parameters<SqliteD1Database['batch']>) => {
          roundTrips += 1
          return inner.batch(...args)
        }
      }
      if (property === 'prepare')
        return (sql: string) => countingStatement(inner.prepare(sql))
      return Reflect.get(inner, property, receiver)
    },
  })
}

function event() {
  return { context: { cloudflare: { env: { DB: db } } } } as any
}

function message(index: number) {
  return { source: 'app', severity: 'info', title: `Title ${index}`, message: `Message ${index}` }
}

function storedCount() {
  return (d1.sqlite.prepare('SELECT COUNT(*) AS count FROM telemetry_messages').get() as { count: number }).count
}

beforeEach(async () => {
  d1 = createSqliteD1()
  db = countingBinding(d1)
  // Applies the schema, so only the messages are counted.
  await recordTelemetryMessages(event(), [message(0)])
  roundTrips = 0
})

afterEach(() => {
  d1.close()
})

describe('recordTelemetryMessages', () => {
  it('writes a request\'s messages in one round trip, skipping the incomplete ones', async () => {
    const inputs = [
      ...Array.from({ length: 98 }, (_, index) => message(index + 1)),
      { source: 'app', severity: 'info', title: '', message: 'no title' },
      { source: '', severity: 'info', title: 'no source', message: 'x' },
    ]

    await expect(recordTelemetryMessages(event(), inputs)).resolves.toBe(98)

    expect(roundTrips).toBe(1)
    expect(storedCount()).toBe(99)
  })

  it('skips a message whose createdAt cannot be parsed and keeps the rest', async () => {
    const inputs = [
      message(1),
      // Past the largest time a Date can hold: `toISOString()` throws on it.
      { ...message(2), createdAt: 9e15 },
      { ...message(3), createdAt: Date.UTC(2026, 9, 8, 12) },
    ]

    await expect(recordTelemetryMessages(event(), inputs)).resolves.toBe(2)

    expect(storedCount()).toBe(3)
    expect(d1.sqlite.prepare(`SELECT created_at FROM telemetry_messages WHERE title = 'Title 3'`).get())
      .toEqual({ created_at: '2026-10-08T12:00:00.000Z' })
  })

  it('keeps none of them when one cannot be written', async () => {
    d1.sqlite.exec(`CREATE TRIGGER refuse_fourth BEFORE INSERT ON telemetry_messages
      WHEN (SELECT COUNT(*) FROM telemetry_messages) >= 3 BEGIN SELECT RAISE(ABORT, 'refused'); END`)

    await expect(recordTelemetryMessages(event(), [message(1), message(2), message(3), message(4)])).resolves.toBe(0)

    expect(storedCount()).toBe(1)
  })
})
