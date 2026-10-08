import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createSqliteD1, type SqliteD1Database } from '../../test/helpers/d1-sqlite'
import { runTelemetryRetention } from './telemetryRetentionStore'

/** The admin retention entry point against real SQLite: dry runs only count, real runs roll up then delete. */

const state = vi.hoisted(() => ({
  db: null as SqliteD1Database | null,
}))

vi.mock('./cloudflare', async importOriginal => ({
  ...(await importOriginal<typeof import('./cloudflare')>()),
  readCloudflareBindings: () => (state.db ? { DB: state.db } : undefined),
}))

const event = {} as any
const now = new Date('2026-06-15T00:00:00.000Z')

function ids(table: string): string[] {
  return (state.db!.sqlite.prepare(`SELECT id FROM ${table} ORDER BY id`).all() as Array<{ id: string }>).map(row => row.id)
}

function stat(date: string, type: string, key = ''): number | undefined {
  const row = state.db!.sqlite.prepare('SELECT value FROM daily_stats WHERE date = ? AND stat_type = ? AND stat_key = ?').get(date, type, key) as { value: number } | undefined
  return row?.value
}

describe('telemetryRetentionStore', () => {
  beforeEach(() => {
    state.db = createSqliteD1()
    state.db.sqlite.exec(`
      CREATE TABLE telemetry_events (id TEXT PRIMARY KEY, event_type TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE platform_governance_events (
        id TEXT PRIMARY KEY, scope TEXT NOT NULL, action TEXT NOT NULL, occurred_at TEXT NOT NULL, created_at TEXT NOT NULL
      );
      INSERT INTO telemetry_events VALUES
        ('t1', 'performance', '2026-05-01T00:00:00.000Z'),
        ('t2', 'search', '2026-05-10T00:00:00.000Z'),
        ('t3', 'visit', '2026-06-10T00:00:00.000Z');
      INSERT INTO platform_governance_events VALUES
        ('g1', 'app', 'visit', '2026-04-01T00:00:00.000Z', '2026-04-01T00:00:00.000Z'),
        ('g2', 'plugin', 'install', '2026-04-20T00:00:00.000Z', '2026-04-20T00:00:00.000Z'),
        ('g3', 'app', 'search', '2026-06-10T00:00:00.000Z', '2026-06-10T00:00:00.000Z');
    `)
  })

  it('reports matched rows without deleting in dry-run mode', async () => {
    const result = await runTelemetryRetention(event, {
      now,
      telemetryRetentionDays: 30,
      governanceRetentionDays: 60,
      batchLimit: 1,
      dryRun: true,
    })

    expect(result.dryRun).toBe(true)
    expect(result.tables).toEqual([
      expect.objectContaining({ table: 'telemetry_events', matched: 2, deleted: 0, remainingAfterBatch: 2 }),
      expect.objectContaining({ table: 'platform_governance_events', matched: 1, deleted: 0, remainingAfterBatch: 1 }),
    ])
    expect(ids('telemetry_events')).toEqual(['t1', 't2', 't3'])
  })

  it('backfills daily stats and deletes old rows in bounded batches', async () => {
    const result = await runTelemetryRetention(event, {
      now,
      telemetryRetentionDays: 30,
      governanceRetentionDays: 60,
      batchLimit: 1,
      dryRun: false,
    })

    expect(result.dryRun).toBe(false)
    expect(result.tables).toEqual([
      expect.objectContaining({ table: 'telemetry_events', matched: 2, deleted: 1, remainingAfterBatch: 1 }),
      expect.objectContaining({ table: 'platform_governance_events', matched: 1, deleted: 1, remainingAfterBatch: 0 }),
    ])
    expect(ids('telemetry_events')).toEqual(['t2', 't3'])
    expect(ids('platform_governance_events')).toEqual(['g2', 'g3'])
    expect(stat('2026-05-01', 'total_events')).toBe(1)
    expect(stat('2026-05-10', 'events_by_type', 'search')).toBe(1)
    expect(stat('2026-04-01', 'governance_scope_action', 'app:visit')).toBe(1)
  })
})
