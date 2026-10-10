import type { D1Database } from '@cloudflare/workers-types'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSqliteD1, type SqliteD1Database } from '../../test/helpers/d1-sqlite'

/**
 * The daily rollup against real SQLite, which applies D1's caps on compound SELECTs and function
 * arguments: how often it runs across isolates, how much a run takes on, and what a failure costs.
 */

type RollupModule = typeof import('./telemetryDailyRollup')

const HOUR_MS = 60 * 60 * 1000
const NOW = new Date('2026-10-11T12:00:00.000Z')

let d1: SqliteD1Database
let db: D1Database

async function loadIsolate(): Promise<RollupModule> {
  vi.resetModules()
  return await import('./telemetryDailyRollup')
}

function createTables() {
  d1.sqlite.exec(`
    CREATE TABLE telemetry_events (
      id TEXT PRIMARY KEY, event_type TEXT NOT NULL, user_id TEXT, client_id TEXT, device_fingerprint TEXT,
      platform TEXT, version TEXT, region TEXT, country_code TEXT, region_code TEXT, region_name TEXT,
      city TEXT, latitude REAL, longitude REAL, timezone TEXT, geo_source TEXT, ip TEXT, search_query TEXT,
      search_duration_ms INTEGER, search_result_count INTEGER, provider_timings TEXT, input_types TEXT,
      metadata TEXT, is_anonymous INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL
    );
    CREATE INDEX idx_telemetry_event_geo ON telemetry_events(event_type, created_at, country_code, region_code);
    CREATE TABLE daily_stats (
      date TEXT NOT NULL, stat_type TEXT NOT NULL, stat_key TEXT NOT NULL DEFAULT '',
      value INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (date, stat_type, stat_key)
    );
  `)
}

/** `count` visits on `date`, one an hour from midnight. */
function seedVisits(date: string, count: number) {
  const insert = d1.sqlite.prepare(`
    INSERT INTO telemetry_events (id, event_type, client_id, platform, region, metadata, created_at)
    VALUES (?, 'visit', ?, 'darwin', 'US', '{}', ?)
  `)
  for (let index = 0; index < count; index += 1)
    insert.run(`${date}-${index}`, `client-${index}`, `${date}T${String(index).padStart(2, '0')}:00:00.000Z`)
}

function storedTotals(): Record<string, number> {
  const rows = d1.sqlite.prepare(`SELECT date, value FROM daily_stats WHERE stat_type = 'total_events' ORDER BY date`).all() as Array<{ date: string, value: number }>
  return Object.fromEntries(rows.map(row => [row.date, row.value]))
}

function at(offsetMs: number): Date {
  return new Date(NOW.getTime() + offsetMs)
}

beforeEach(() => {
  d1 = createSqliteD1()
  db = d1 as unknown as D1Database
  createTables()
  // The day holding the oldest event may have lost some to retention and is never rolled up, so
  // 2026-10-08 is a complete day here: only the first-day rule keeps it out.
  seedVisits('2026-10-07', 1)
  seedVisits('2026-10-08', 3)
  seedVisits('2026-10-09', 4)
  seedVisits('2026-10-10', 5)
  seedVisits('2026-10-11', 2)
})

afterEach(() => {
  vi.useRealTimers()
  d1.close()
})

describe('runTelemetryDailyRollupIfDue', () => {
  it('rolls up one finished day an hour, oldest first, from the first day ingestion stopped counting', async () => {
    const rollup = await loadIsolate()

    expect(await rollup.runTelemetryDailyRollupIfDue(db, NOW)).toBe('2026-10-09')
    expect(storedTotals()).toEqual({ '2026-10-09': 4 })

    // Within the hour nothing runs; the next hour takes the next day.
    expect(await rollup.runTelemetryDailyRollupIfDue(db, at(30 * 60 * 1000))).toBeNull()
    expect(await rollup.runTelemetryDailyRollupIfDue(db, at(HOUR_MS + 1))).toBe('2026-10-10')

    // Then nothing is waiting: 2026-10-08 keeps what ingestion wrote, today is not over.
    expect(await rollup.runTelemetryDailyRollupIfDue(db, at(2 * HOUR_MS + 2))).toBeNull()
    expect(storedTotals()).toEqual({ '2026-10-09': 4, '2026-10-10': 5 })
  })

  it('runs in one isolate of the fleet per hour', async () => {
    const first = await loadIsolate()
    const second = await loadIsolate()

    const results = await Promise.all([
      first.runTelemetryDailyRollupIfDue(db, NOW),
      second.runTelemetryDailyRollupIfDue(db, NOW),
    ])

    expect(results.filter(Boolean)).toEqual(['2026-10-09'])
  })

  it('leaves a failing day alone for a day instead of reading it again every hour', async () => {
    const rollup = await loadIsolate()
    const refusing = {
      prepare: (sql: string) => d1.prepare(sql),
      batch: (statements: Parameters<SqliteD1Database['batch']>[0]) => {
        if (statements.some(statement => statement.sql.includes('INSERT INTO daily_stats')))
          return Promise.reject(new Error('D1_ERROR: too many terms in compound SELECT: SQLITE_ERROR'))
        return d1.batch(statements)
      },
    } as unknown as D1Database

    await expect(rollup.runTelemetryDailyRollupIfDue(refusing, NOW)).rejects.toThrow(/compound SELECT/)
    expect(storedTotals()).toEqual({})

    expect(await rollup.runTelemetryDailyRollupIfDue(db, at(2 * HOUR_MS))).toBeNull()
    expect(await rollup.runTelemetryDailyRollupIfDue(db, at(23 * HOUR_MS))).toBeNull()
    expect(await rollup.runTelemetryDailyRollupIfDue(db, at(24 * HOUR_MS + 1))).toBe('2026-10-09')
  })
})

describe('scheduleTelemetryDailyRollup', () => {
  it('checks at most every ten minutes per isolate, after the response', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
    const rollup = await loadIsolate()
    const waited: Array<Promise<unknown>> = []
    const event = { context: { waitUntil: (promise: Promise<unknown>) => waited.push(promise) } } as any

    rollup.scheduleTelemetryDailyRollup(event, db)
    rollup.scheduleTelemetryDailyRollup(event, db)
    expect(waited).toHaveLength(1)
    await Promise.all(waited)
    expect(storedTotals()).toEqual({ '2026-10-09': 4 })

    vi.setSystemTime(at(11 * 60 * 1000))
    rollup.scheduleTelemetryDailyRollup(event, db)
    expect(waited).toHaveLength(2)
    await Promise.all(waited)
    // The lease still holds: the second check rolled nothing up.
    expect(storedTotals()).toEqual({ '2026-10-09': 4 })
  })
})
