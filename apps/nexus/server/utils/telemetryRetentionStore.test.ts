import { beforeEach, describe, expect, it, vi } from 'vitest'
import { runTelemetryRetention } from './telemetryRetentionStore'

interface TimedRow {
  id: string
  created_at: string
  occurred_at?: string
  event_type?: string
}

interface DailyStatRow {
  date: string
  stat_type: string
  stat_key: string
  value: number
}

class MockStatement {
  private args: any[] = []

  constructor(
    private readonly db: MockD1Database,
    private readonly sql: string,
  ) {}

  bind(...args: any[]) {
    this.args = args
    return this
  }

  async run() {
    return this.db.run(this.sql, this.args)
  }

  async first<T = any>() {
    return this.db.first(this.sql, this.args) as T
  }
}

class MockD1Database {
  telemetryRows: TimedRow[] = []
  governanceRows: TimedRow[] = []
  dailyStats = new Map<string, DailyStatRow>()

  prepare(sql: string) {
    return new MockStatement(this, sql)
  }

  run(sql: string, args: any[]) {
    if (sql.includes('CREATE TABLE'))
      return { meta: { changes: 0 } }

    if (sql.includes('INSERT INTO daily_stats') && sql.includes("'total_events'")) {
      const cutoff = String(args[0])
      const counts = new Map<string, number>()
      for (const row of this.telemetryRows.filter(item => item.created_at < cutoff)) {
        const date = row.created_at.slice(0, 10)
        counts.set(date, (counts.get(date) ?? 0) + 1)
      }
      for (const [date, value] of counts)
        this.putDailyStat(date, 'total_events', '', value)
      return { meta: { changes: counts.size } }
    }

    if (sql.includes('INSERT INTO daily_stats') && sql.includes("'events_by_type'")) {
      const cutoff = String(args[0])
      const counts = new Map<string, number>()
      for (const row of this.telemetryRows.filter(item => item.created_at < cutoff)) {
        const key = `${row.created_at.slice(0, 10)}:${row.event_type ?? ''}`
        counts.set(key, (counts.get(key) ?? 0) + 1)
      }
      for (const [key, value] of counts) {
        const [date, eventType] = key.split(':')
        this.putDailyStat(String(date), 'events_by_type', String(eventType), value)
      }
      return { meta: { changes: counts.size } }
    }

    if (sql.includes('DELETE FROM telemetry_events')) {
      const cutoff = String(args[0])
      const limit = Number(args[1])
      const deleteIds = this.telemetryRows
        .filter(row => row.created_at < cutoff)
        .sort((a, b) => a.created_at.localeCompare(b.created_at))
        .slice(0, limit)
        .map(row => row.id)
      this.telemetryRows = this.telemetryRows.filter(row => !deleteIds.includes(row.id))
      return { meta: { changes: deleteIds.length } }
    }

    if (sql.includes('DELETE FROM platform_governance_events')) {
      const cutoff = String(args[0])
      const limit = Number(args[1])
      const deleteIds = this.governanceRows
        .filter(row => String(row.occurred_at) < cutoff)
        .sort((a, b) => String(a.occurred_at).localeCompare(String(b.occurred_at)))
        .slice(0, limit)
        .map(row => row.id)
      this.governanceRows = this.governanceRows.filter(row => !deleteIds.includes(row.id))
      return { meta: { changes: deleteIds.length } }
    }

    return { meta: { changes: 0 } }
  }

  first(sql: string, args: any[]) {
    const cutoff = String(args[0])
    if (sql.includes('FROM telemetry_events'))
      return { count: this.telemetryRows.filter(row => row.created_at < cutoff).length }
    if (sql.includes('FROM platform_governance_events'))
      return { count: this.governanceRows.filter(row => String(row.occurred_at) < cutoff).length }
    return null
  }

  private putDailyStat(date: string, statType: string, statKey: string, value: number) {
    const key = `${date}:${statType}:${statKey}`
    if (!this.dailyStats.has(key)) {
      this.dailyStats.set(key, {
        date,
        stat_type: statType,
        stat_key: statKey,
        value,
      })
    }
  }
}

const state = vi.hoisted(() => ({
  db: null as MockD1Database | null,
}))

vi.mock('./cloudflare', () => ({
  readCloudflareBindings: () => state.db ? { DB: state.db } : undefined,
}))

const event = {} as any
const now = new Date('2026-06-15T00:00:00.000Z')

describe('telemetryRetentionStore', () => {
  beforeEach(() => {
    state.db = new MockD1Database()
    state.db.telemetryRows = [
      { id: 't1', created_at: '2026-05-01T00:00:00.000Z', event_type: 'performance' },
      { id: 't2', created_at: '2026-05-10T00:00:00.000Z', event_type: 'search' },
      { id: 't3', created_at: '2026-06-10T00:00:00.000Z', event_type: 'visit' },
    ]
    state.db.governanceRows = [
      { id: 'g1', created_at: '2026-04-01T00:00:00.000Z', occurred_at: '2026-04-01T00:00:00.000Z' },
      { id: 'g2', created_at: '2026-04-20T00:00:00.000Z', occurred_at: '2026-04-20T00:00:00.000Z' },
      { id: 'g3', created_at: '2026-06-10T00:00:00.000Z', occurred_at: '2026-06-10T00:00:00.000Z' },
    ]
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
    expect(state.db?.telemetryRows.map(row => row.id)).toEqual(['t1', 't2', 't3'])
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
    expect(state.db?.telemetryRows.map(row => row.id)).toEqual(['t2', 't3'])
    expect(state.db?.governanceRows.map(row => row.id)).toEqual(['g2', 'g3'])
    expect(state.db?.dailyStats.get('2026-05-01:total_events:')?.value).toBe(1)
    expect(state.db?.dailyStats.get('2026-05-10:events_by_type:search')?.value).toBe(1)
  })
})
