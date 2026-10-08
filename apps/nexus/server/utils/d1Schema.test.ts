import type { D1Database } from '@cloudflare/workers-types'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSqliteD1, type SqliteD1Database, type SqliteD1Statement } from '../../test/helpers/d1-sqlite'
import { defineD1Schema, ensureD1Schema } from './d1Schema'

/**
 * The schema gate against real SQLite. What matters is the number of round trips an isolate pays,
 * so the database below counts them the way D1 bills latency: one per statement executed on its
 * own, one per batch however many statements it carries.
 */

interface CountingD1 {
  db: D1Database
  sqlite: SqliteD1Database
  roundTrips: () => number
  executed: string[]
}

function countingD1(sqlite: SqliteD1Database = createSqliteD1()): CountingD1 {
  let roundTrips = 0
  const executed: string[] = []

  function wrap(statement: SqliteD1Statement): SqliteD1Statement {
    return new Proxy(statement, {
      get(target, property, receiver) {
        if (property === 'bind')
          return (...values: unknown[]) => wrap(target.bind(...values))
        if (property === 'first' || property === 'all' || property === 'run') {
          return (...args: unknown[]) => {
            roundTrips += 1
            executed.push(target.sql)
            return (target as any)[property](...args)
          }
        }
        return Reflect.get(target, property, receiver)
      },
    })
  }

  const db = {
    prepare: (sql: string) => wrap(sqlite.prepare(sql)),
    batch: async (statements: SqliteD1Statement[]) => {
      roundTrips += 1
      executed.push(...statements.map(statement => statement.sql))
      return sqlite.batch(statements)
    },
  }

  return { db: db as unknown as D1Database, sqlite, roundTrips: () => roundTrips, executed }
}

function tableColumns(sqlite: SqliteD1Database, table: string): string[] {
  return (sqlite.sqlite.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map(row => row.name)
}

function indexNames(sqlite: SqliteD1Database, table: string): string[] {
  return (sqlite.sqlite.prepare(`PRAGMA index_list(${table})`).all() as Array<{ name: string }>).map(row => row.name)
}

const WIDGETS = defineD1Schema('widgets', {
  statements: [
    `CREATE INDEX IF NOT EXISTS idx_widgets_owner ON widgets(owner_id)`,
    `CREATE TABLE IF NOT EXISTS widgets (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL)`,
  ],
})

describe('ensureD1Schema', () => {
  it('applies a definition the database has never recorded in one round trip, tables before indexes', async () => {
    const d1 = countingD1()

    await ensureD1Schema(d1.db, WIDGETS)

    expect(d1.roundTrips()).toBe(2) // read the record, then one batch
    expect(tableColumns(d1.sqlite, 'widgets')).toEqual(['id', 'owner_id'])
    expect(indexNames(d1.sqlite, 'widgets')).toContain('idx_widgets_owner')
    const recorded = d1.sqlite.sqlite.prepare('SELECT key FROM nexus_schema_state').all()
    expect(recorded).toEqual([{ key: 'widgets' }])
  })

  it('costs nothing more once applied in the same isolate', async () => {
    const d1 = countingD1()
    await ensureD1Schema(d1.db, WIDGETS)
    const afterFirst = d1.roundTrips()

    await ensureD1Schema(d1.db, WIDGETS)
    await ensureD1Schema(d1.db, WIDGETS)

    expect(d1.roundTrips()).toBe(afterFirst)
  })

  it('lets a later isolate find the definitions on record with one query for every store', async () => {
    const sqlite = createSqliteD1()
    const first = countingD1(sqlite)
    const other = defineD1Schema('gadgets', {
      statements: [`CREATE TABLE IF NOT EXISTS gadgets (id TEXT PRIMARY KEY)`],
    })
    await ensureD1Schema(first.db, WIDGETS)
    await ensureD1Schema(first.db, other)

    // A new isolate: a new binding object over the same database.
    const later = countingD1(sqlite)
    await ensureD1Schema(later.db, WIDGETS)
    await ensureD1Schema(later.db, other)

    expect(later.roundTrips()).toBe(1)
    expect(later.executed).toEqual(['SELECT key, hash FROM nexus_schema_state'])
  })

  /**
   * A Worker cancels a request's I/O when its client disconnects, and the read it started then never
   * settles. Callers sharing that read would wait on it forever — every later request in the isolate.
   */
  it('does not make other callers wait on a read that never settles', async () => {
    const d1 = countingD1()
    let hangNextRead = true
    const db = {
      prepare: (sql: string) => {
        if (hangNextRead && sql.startsWith('SELECT key, hash')) {
          hangNextRead = false
          return { all: () => new Promise(() => {}) }
        }
        return d1.db.prepare(sql)
      },
      batch: (statements: unknown[]) => (d1.db.batch as any)(statements),
    } as unknown as D1Database

    void ensureD1Schema(db, WIDGETS)
    const second = await Promise.race([
      ensureD1Schema(db, WIDGETS).then(() => 'applied'),
      new Promise(resolve => setTimeout(resolve, 500, 'still waiting')),
    ])

    expect(second).toBe('applied')
    expect(tableColumns(d1.sqlite, 'widgets')).toEqual(['id', 'owner_id'])
  })

  it('adds only the columns an older table is missing, before the indexes that need them', async () => {
    const d1 = countingD1()
    d1.sqlite.sqlite.exec(`CREATE TABLE things (id TEXT PRIMARY KEY, name TEXT)`)
    const things = defineD1Schema('things', {
      statements: [
        `CREATE TABLE IF NOT EXISTS things (id TEXT PRIMARY KEY, name TEXT, status TEXT NOT NULL DEFAULT 'new', score INTEGER)`,
        `CREATE INDEX IF NOT EXISTS idx_things_status ON things(status)`,
      ],
      columns: [{
        table: 'things',
        columns: [
          { name: 'name', ddl: 'name TEXT' },
          { name: 'status', ddl: `status TEXT NOT NULL DEFAULT 'new'` },
          { name: 'score', ddl: 'score INTEGER' },
        ],
      }],
    })

    await ensureD1Schema(d1.db, things)

    expect(tableColumns(d1.sqlite, 'things')).toEqual(['id', 'name', 'status', 'score'])
    expect(indexNames(d1.sqlite, 'things')).toContain('idx_things_status')
    expect(d1.executed.filter(sql => sql.startsWith('ALTER TABLE'))).toEqual([
      `ALTER TABLE things ADD COLUMN status TEXT NOT NULL DEFAULT 'new'`,
      'ALTER TABLE things ADD COLUMN score INTEGER',
    ])
  })

  it('runs backfills when the definition is applied, never on the requests after it', async () => {
    const d1 = countingD1()
    d1.sqlite.sqlite.exec(`
      CREATE TABLE accounts (id TEXT PRIMARY KEY, email_verified TEXT, email_state TEXT NOT NULL DEFAULT 'unverified');
      INSERT INTO accounts VALUES ('a', '2026-01-01', 'unverified'), ('b', NULL, 'unverified');
    `)
    const accounts = defineD1Schema('accounts', {
      statements: [`CREATE TABLE IF NOT EXISTS accounts (id TEXT PRIMARY KEY, email_verified TEXT, email_state TEXT NOT NULL DEFAULT 'unverified')`],
      backfills: [`UPDATE accounts SET email_state = 'verified' WHERE email_verified IS NOT NULL AND email_state != 'verified'`],
    })

    await ensureD1Schema(d1.db, accounts)
    const rows = d1.sqlite.sqlite.prepare('SELECT id, email_state FROM accounts ORDER BY id').all()
    expect(rows).toEqual([{ id: 'a', email_state: 'verified' }, { id: 'b', email_state: 'unverified' }])

    const later = countingD1(d1.sqlite)
    await ensureD1Schema(later.db, accounts)
    expect(later.executed.some(sql => sql.startsWith('UPDATE'))).toBe(false)
  })

  it('re-applies a changed definition and keeps both on record for a rollout where old and new code overlap', async () => {
    const sqlite = createSqliteD1()
    const v1 = defineD1Schema('notes', { statements: [`CREATE TABLE IF NOT EXISTS notes (id TEXT PRIMARY KEY)`] })
    const v2 = defineD1Schema('notes', {
      statements: [
        `CREATE TABLE IF NOT EXISTS notes (id TEXT PRIMARY KEY, body TEXT)`,
        `CREATE INDEX IF NOT EXISTS idx_notes_body ON notes(body)`,
      ],
      columns: [{ table: 'notes', columns: [{ name: 'body', ddl: 'body TEXT' }] }],
    })
    expect(v2.hash).not.toBe(v1.hash)

    await ensureD1Schema(countingD1(sqlite).db, v1)
    await ensureD1Schema(countingD1(sqlite).db, v2)

    expect(tableColumns(sqlite, 'notes')).toEqual(['id', 'body'])
    const oldCode = countingD1(sqlite)
    const newCode = countingD1(sqlite)
    await ensureD1Schema(oldCode.db, v1)
    await ensureD1Schema(newCode.db, v2)
    expect(oldCode.roundTrips()).toBe(1)
    expect(newCode.roundTrips()).toBe(1)
  })

  it('runs a one-off migration when the definition is applied and re-applies when its id changes', async () => {
    const sqlite = createSqliteD1()
    const runs: string[] = []
    const define = (id: string) => defineD1Schema('ratings', {
      statements: [`CREATE TABLE IF NOT EXISTS ratings (id TEXT PRIMARY KEY)`],
      migrate: { id, run: async () => { runs.push(id) } },
    })

    await ensureD1Schema(countingD1(sqlite).db, define('copy-legacy-v1'))
    await ensureD1Schema(countingD1(sqlite).db, define('copy-legacy-v1'))
    expect(runs).toEqual(['copy-legacy-v1'])

    await ensureD1Schema(countingD1(sqlite).db, define('copy-legacy-v2'))
    expect(runs).toEqual(['copy-legacy-v1', 'copy-legacy-v2'])
  })

  it('treats whitespace-only edits as the same definition', () => {
    const compact = defineD1Schema('x', { statements: ['CREATE TABLE IF NOT EXISTS x (id TEXT)'] })
    const spread = defineD1Schema('x', { statements: [`
      CREATE TABLE IF NOT EXISTS x (
        id TEXT
      )
    `] })
    expect(spread.hash).toBe(compact.hash)
  })

  it('rolls a failed apply back and retries it on the next call', async () => {
    const d1 = countingD1()
    const broken = defineD1Schema('broken', {
      statements: [
        `CREATE TABLE IF NOT EXISTS broken (id TEXT PRIMARY KEY)`,
        `CREATE INDEX IF NOT EXISTS idx_broken_missing ON broken(missing_column)`,
      ],
    })

    await expect(ensureD1Schema(d1.db, broken)).rejects.toThrow(/missing_column/)
    // The batch was one transaction: neither the table nor the record survived.
    expect(d1.sqlite.sqlite.prepare(`SELECT name FROM sqlite_master WHERE name = 'broken'`).all()).toEqual([])

    const roundTripsBefore = d1.roundTrips()
    await expect(ensureD1Schema(d1.db, broken)).rejects.toThrow(/missing_column/)
    expect(d1.roundTrips()).toBeGreaterThan(roundTripsBefore)
  })

  describe('when the database refuses writes', () => {
    afterEach(() => {
      vi.useRealTimers()
    })

    it('lets the caller read on without the definition, and applies it once writes are taken again', async () => {
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(new Date('2026-10-08T13:00:00Z'))
      const d1 = countingD1()
      // An earlier deploy created the table, without the index the current definition adds.
      d1.sqlite.sqlite.exec(`CREATE TABLE widgets (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL)`)
      let refusing = true
      let applyAttempts = 0
      const db = {
        prepare: (sql: string) => d1.db.prepare(sql),
        batch: (statements: unknown[]) => {
          applyAttempts += 1
          if (refusing) {
            return Promise.reject(new Error('D1_ERROR: Your account has exceeded D1\'s free tier daily row write limit. Upgrade to a paid plan or wait until tomorrow (midnight UTC) to continue.'))
          }
          return (d1.db.batch as any)(statements)
        },
      } as unknown as D1Database

      await expect(ensureD1Schema(db, WIDGETS)).resolves.toBeUndefined()
      expect(applyAttempts).toBe(1)
      expect(indexNames(d1.sqlite, 'widgets')).not.toContain('idx_widgets_owner')

      // Requests in the next minute do not each pay for a write that cannot succeed.
      vi.setSystemTime(new Date('2026-10-08T13:00:59Z'))
      await ensureD1Schema(db, WIDGETS)
      expect(applyAttempts).toBe(1)

      refusing = false
      vi.setSystemTime(new Date('2026-10-08T13:01:01Z'))
      await ensureD1Schema(db, WIDGETS)
      expect(applyAttempts).toBe(2)
      expect(indexNames(d1.sqlite, 'widgets')).toContain('idx_widgets_owner')
      expect(d1.sqlite.sqlite.prepare(`SELECT key FROM nexus_schema_state`).all()).toEqual([{ key: 'widgets' }])

      await ensureD1Schema(db, WIDGETS)
      expect(applyAttempts).toBe(2)
    })

    it('still fails a definition the database rejects for any other reason', async () => {
      const db = {
        prepare: (sql: string) => countingD1().db.prepare(sql),
        batch: () => Promise.reject(new Error('D1_ERROR: near "CREAT": syntax error')),
      } as unknown as D1Database

      await expect(ensureD1Schema(db, WIDGETS)).rejects.toThrow(/syntax error/)
    })
  })

  it('still applies when the record cannot be read for a reason other than a missing table', async () => {
    const d1 = countingD1()
    const failingRead = {
      prepare: (sql: string) => {
        if (sql.startsWith('SELECT key, hash'))
          throw new Error('D1_ERROR: network connection lost')
        return d1.db.prepare(sql)
      },
      batch: (statements: unknown[]) => (d1.db.batch as any)(statements),
    } as unknown as D1Database

    await ensureD1Schema(failingRead, WIDGETS)

    expect(tableColumns(d1.sqlite, 'widgets')).toEqual(['id', 'owner_id'])
  })
})
