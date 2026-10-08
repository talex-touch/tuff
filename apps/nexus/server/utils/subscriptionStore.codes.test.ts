import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createSqliteD1, type SqliteD1Database } from '../../test/helpers/d1-sqlite'
import { createActivationCodes } from './subscriptionStore'

/**
 * The admin code generator against real SQLite. What it costs is round trips: one per statement run
 * on its own, one per batch.
 */

let d1: SqliteD1Database
let db: SqliteD1Database
let roundTrips = 0

type Statement = ReturnType<SqliteD1Database['prepare']>

/** A statement that counts its own runs, and those of the statements its `bind` returns. */
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

/** The binding, counting its round trips. One object for the whole test, as a Worker isolate holds one. */
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

beforeEach(() => {
  d1 = createSqliteD1()
  db = countingBinding(d1)
  roundTrips = 0
})

afterEach(() => {
  d1.close()
})

describe('createActivationCodes', () => {
  it('writes a hundred codes in one round trip', async () => {
    // Applies the schema first, so only the codes are counted.
    await createActivationCodes(event(), { plan: 'PRO', durationDays: 30 }, 1)
    roundTrips = 0

    const codes = await createActivationCodes(event(), { plan: 'PRO', durationDays: 30, maxUses: 3, expiresInDays: 7, createdBy: 'admin_1' }, 100)

    expect(roundTrips).toBe(1)
    expect(codes).toHaveLength(100)
    expect(new Set(codes.map(code => code.code)).size).toBe(100)
    const rows = d1.sqlite.prepare(`SELECT id, plan, duration_days, max_uses, uses, created_by, status, expires_at FROM activation_codes WHERE created_by = 'admin_1'`).all() as Array<Record<string, unknown>>
    expect(rows.map(row => row.id).sort()).toEqual(codes.map(code => code.id).sort())
    expect(rows[0]).toMatchObject({ plan: 'PRO', duration_days: 30, max_uses: 3, uses: 0, status: 'active' })
    expect(typeof rows[0]!.expires_at).toBe('string')
  })

  it('writes none of them when one cannot be written', async () => {
    await createActivationCodes(event(), { plan: 'PRO', durationDays: 30 }, 1)
    const before = d1.sqlite.prepare(`SELECT COUNT(*) AS count FROM activation_codes`).get()
    // A row the table refuses part way through stands in for any failed insert.
    d1.sqlite.exec(`CREATE TRIGGER refuse_third BEFORE INSERT ON activation_codes
      WHEN (SELECT COUNT(*) FROM activation_codes) >= 3 BEGIN SELECT RAISE(ABORT, 'refused'); END`)

    await expect(createActivationCodes(event(), { plan: 'PRO', durationDays: 30 }, 5)).rejects.toThrow(/refused/)

    expect(d1.sqlite.prepare(`SELECT COUNT(*) AS count FROM activation_codes`).get()).toEqual(before)
  })
})
