import type { D1Database } from '@cloudflare/workers-types'
import { beforeEach, describe, expect, it } from 'vitest'
import { createSqliteD1, type SqliteD1Database, type SqliteD1Statement } from '../../test/helpers/d1-sqlite'
import { runTelemetryRetentionMaintenanceIfDue } from './telemetryRetentionMaintenance'

/**
 * Retention maintenance against real SQLite: the lease, the rollups and the deletes are the store's
 * own statements, so a rollup that double counts or a claim that lets two runs in is caught here
 * rather than agreed with by a fake.
 */

const SOURCE_DDL = `
  CREATE TABLE telemetry_events (
    id TEXT PRIMARY KEY,
    event_type TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX idx_telemetry_event_geo ON telemetry_events(event_type, created_at);
  CREATE TABLE platform_governance_events (
    id TEXT PRIMARY KEY,
    scope TEXT NOT NULL,
    action TEXT NOT NULL,
    occurred_at TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX idx_platform_governance_events_occurred_at ON platform_governance_events(occurred_at);
`

const now = new Date('2026-06-15T00:00:00.000Z')

/** Counts round trips: one per statement run on its own, one per batch. */
function countingD1(sqlite: SqliteD1Database) {
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
    prepare: (sql: string) => wrap(sqlite.prepare(sql)),
    batch: async (statements: SqliteD1Statement[]) => {
      roundTrips += 1
      return sqlite.batch(statements)
    },
  }
  return { db: db as unknown as D1Database, roundTrips: () => roundTrips }
}

function insertTelemetry(sqlite: SqliteD1Database, rows: Array<[id: string, type: string, createdAt: string]>) {
  const insert = sqlite.sqlite.prepare('INSERT INTO telemetry_events (id, event_type, created_at) VALUES (?, ?, ?)')
  sqlite.sqlite.exec('BEGIN')
  for (const row of rows)
    insert.run(...row)
  sqlite.sqlite.exec('COMMIT')
}

function insertGovernance(sqlite: SqliteD1Database, rows: Array<[id: string, scope: string, action: string, occurredAt: string]>) {
  const insert = sqlite.sqlite.prepare('INSERT INTO platform_governance_events (id, scope, action, occurred_at, created_at) VALUES (?, ?, ?, ?, ?)')
  for (const [id, scope, action, occurredAt] of rows)
    insert.run(id, scope, action, occurredAt, occurredAt)
}

function ids(sqlite: SqliteD1Database, table: string): string[] {
  return (sqlite.sqlite.prepare(`SELECT id FROM ${table} ORDER BY id`).all() as Array<{ id: string }>).map(row => row.id)
}

function stat(sqlite: SqliteD1Database, date: string, type: string, key = ''): number | undefined {
  const row = sqlite.sqlite.prepare('SELECT value FROM daily_stats WHERE date = ? AND stat_type = ? AND stat_key = ?').get(date, type, key) as { value: number } | undefined
  return row?.value
}

describe('telemetryRetentionMaintenance', () => {
  let sqlite: SqliteD1Database

  beforeEach(() => {
    sqlite = createSqliteD1()
    sqlite.sqlite.exec(SOURCE_DDL)
    insertTelemetry(sqlite, [
      ['t1', 'performance', '2026-05-01T00:00:00.000Z'],
      ['t2', 'search', '2026-05-10T00:00:00.000Z'],
      ['t3', 'visit', '2026-06-10T00:00:00.000Z'],
    ])
    insertGovernance(sqlite, [
      ['g1', 'app', 'visit', '2026-04-01T00:00:00.000Z'],
      ['g2', 'plugin', 'install', '2026-04-20T00:00:00.000Z'],
      ['g2b', 'plugin', 'install', '2026-04-20T08:00:00.000Z'],
      ['g2c', 'plugin', 'update', '2026-04-20T09:00:00.000Z'],
      ['g3', 'app', 'search', '2026-06-10T00:00:00.000Z'],
    ])
  })

  it('claims due maintenance, compresses old detail rows, and schedules the next regular check', async () => {
    const result = await runTelemetryRetentionMaintenanceIfDue(createSqliteD1Facade(sqlite), { now })

    expect(result.status).toBe('completed')
    expect(result.nextRunAt).toBe('2026-06-15T06:00:00.000Z')
    expect(ids(sqlite, 'telemetry_events')).toEqual(['t3'])
    expect(ids(sqlite, 'platform_governance_events')).toEqual(['g3'])
    expect(stat(sqlite, '2026-05-01', 'total_events')).toBe(1)
    expect(stat(sqlite, '2026-05-10', 'events_by_type', 'search')).toBe(1)
    expect(stat(sqlite, '2026-04-01', 'governance_total_events')).toBe(1)
    expect(stat(sqlite, '2026-04-20', 'governance_total_events')).toBe(3)
    expect(stat(sqlite, '2026-04-20', 'governance_scope', 'plugin')).toBe(3)
    expect(stat(sqlite, '2026-04-01', 'governance_action', 'visit')).toBe(1)
    expect(stat(sqlite, '2026-04-20', 'governance_action', 'install')).toBe(2)
    expect(stat(sqlite, '2026-04-20', 'governance_scope_action', 'plugin:install')).toBe(2)
    expect(stat(sqlite, '2026-04-20', 'governance_scope_action', 'plugin:update')).toBe(1)
    // Nothing from inside the retention window was rolled up.
    expect(stat(sqlite, '2026-06-10', 'total_events')).toBeUndefined()
    expect(stat(sqlite, '2026-06-10', 'governance_total_events')).toBeUndefined()
  })

  it('keeps governance events as long as the longest enabled quota window counts them', async () => {
    sqlite.sqlite.exec(`
      CREATE TABLE platform_governance_configs (config_type TEXT NOT NULL, enabled INTEGER NOT NULL, limits_json TEXT);
      INSERT INTO platform_governance_configs VALUES ('intelligence_provider_quota', 1, '{"windowDays":70,"maxRequests":10}');
      INSERT INTO platform_governance_configs VALUES ('intelligence_provider_quota', 0, '{"windowDays":365}');
    `)
    insertGovernance(sqlite, [['g4', 'intelligence', 'provider.request', '2026-04-10T00:00:00.000Z']])

    await runTelemetryRetentionMaintenanceIfDue(createSqliteD1Facade(sqlite), { now })

    // The enabled quota counts 70 days: what is 56 and 66 days old stays, 75 days old goes; the
    // disabled 365-day quota counts nothing.
    expect(ids(sqlite, 'platform_governance_events')).toEqual(['g2', 'g2b', 'g2c', 'g3', 'g4'])
  })

  it('skips when the maintenance state is not due, in one round trip', async () => {
    await runTelemetryRetentionMaintenanceIfDue(createSqliteD1Facade(sqlite), { now })

    const counting = countingD1(sqlite)
    const warm = await runTelemetryRetentionMaintenanceIfDue(counting.db, { now })
    expect(warm.status).toBe('skipped')
    const afterSchema = counting.roundTrips()

    const skipped = await runTelemetryRetentionMaintenanceIfDue(counting.db, { now })
    expect(skipped).toEqual({
      status: 'skipped',
      reason: 'not_due_or_locked',
      nextRunAt: '2026-06-15T06:00:00.000Z',
    })
    expect(counting.roundTrips() - afterSchema).toBe(1)
  })

  it('lets only one of two concurrent checks run', async () => {
    const db = createSqliteD1Facade(sqlite)
    const results = await Promise.all([
      runTelemetryRetentionMaintenanceIfDue(db, { now }),
      runTelemetryRetentionMaintenanceIfDue(db, { now }),
    ])
    expect(results.map(result => result.status).sort()).toEqual(['completed', 'skipped'])
  })

  it('schedules a short retry when a cleanup batch leaves backlog', async () => {
    sqlite.sqlite.exec('DELETE FROM telemetry_events')
    insertTelemetry(sqlite, Array.from({ length: 10002 }, (_, index): [string, string, string] => [
      `t${String(index).padStart(5, '0')}`,
      'search',
      index === 10001 ? '2026-06-10T00:00:00.000Z' : '2026-05-01T00:00:00.000Z',
    ]))

    const result = await runTelemetryRetentionMaintenanceIfDue(createSqliteD1Facade(sqlite), { now })

    expect(result.status).toBe('completed')
    expect(result.nextRunAt).toBe('2026-06-15T00:05:00.000Z')
    expect(result.result?.tables[0]).toEqual(expect.objectContaining({
      table: 'telemetry_events',
      matched: 10001,
      deleted: 10000,
      remainingAfterBatch: 1,
    }))
    // The day was rolled up from all of its rows before any were deleted.
    expect(stat(sqlite, '2026-05-01', 'total_events')).toBe(10001)
  })
})

/** The store takes the binding's type; the shim has the same surface. */
function createSqliteD1Facade(sqlite: SqliteD1Database): D1Database {
  return sqlite as unknown as D1Database
}
