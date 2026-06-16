import { beforeEach, describe, expect, it, vi } from 'vitest'
import { runTelemetryRetentionMaintenanceIfDue } from './telemetryRetentionMaintenance'

interface TimedRow {
  id: string
  created_at: string
  occurred_at?: string
  event_type?: string
  scope?: string
  action?: string
}

interface DailyStatRow {
  date: string
  stat_type: string
  stat_key: string
  value: number
}

interface MaintenanceStateRow {
  key: string
  status: string
  next_run_at: string | null
  lock_expires_at: string | null
  last_result_json?: string | null
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
  maintenanceState = new Map<string, MaintenanceStateRow>()

  prepare(sql: string) {
    return new MockStatement(this, sql)
  }

  run(sql: string, args: any[]) {
    if (sql.includes('CREATE TABLE'))
      return { meta: { changes: 0 } }

    if (sql.includes('INSERT INTO nexus_maintenance_state')) {
      const [key, nextRunAt] = args
      if (!this.maintenanceState.has(String(key))) {
        this.maintenanceState.set(String(key), {
          key: String(key),
          status: 'idle',
          next_run_at: String(nextRunAt),
          lock_expires_at: null,
        })
        return { meta: { changes: 1 } }
      }
      return { meta: { changes: 0 } }
    }

    if (sql.includes('UPDATE nexus_maintenance_state') && sql.includes("status = 'running'")) {
      const [nowIso, lockExpiresAt, key] = args
      const row = this.maintenanceState.get(String(key))
      if (!row)
        return { meta: { changes: 0 } }
      const isLocked = row.status === 'running' && row.lock_expires_at && row.lock_expires_at > String(nowIso)
      const isDue = !row.next_run_at || row.next_run_at <= String(nowIso)
      if (isLocked || !isDue)
        return { meta: { changes: 0 } }
      row.status = 'running'
      row.lock_expires_at = String(lockExpiresAt)
      return { meta: { changes: 1 } }
    }

    if (sql.includes('UPDATE nexus_maintenance_state') && sql.includes("status = 'succeeded'")) {
      const [nowIso, nextRunAt, resultJson, key] = args
      const row = this.maintenanceState.get(String(key))
      if (!row)
        return { meta: { changes: 0 } }
      row.status = 'succeeded'
      row.next_run_at = String(nextRunAt)
      row.lock_expires_at = null
      row.last_result_json = String(resultJson)
      void nowIso
      return { meta: { changes: 1 } }
    }

    if (sql.includes('UPDATE nexus_maintenance_state') && sql.includes("status = 'failed'")) {
      const [nextRunAt, _message, _nowIso, key] = args
      const row = this.maintenanceState.get(String(key))
      if (!row)
        return { meta: { changes: 0 } }
      row.status = 'failed'
      row.next_run_at = String(nextRunAt)
      row.lock_expires_at = null
      return { meta: { changes: 1 } }
    }

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

    if (sql.includes('INSERT INTO daily_stats') && sql.includes("'governance_total_events'")) {
      const cutoff = String(args[0])
      const counts = new Map<string, number>()
      for (const row of this.governanceRows.filter(item => String(item.occurred_at) < cutoff)) {
        const date = String(row.occurred_at).slice(0, 10)
        counts.set(date, (counts.get(date) ?? 0) + 1)
      }
      for (const [date, value] of counts)
        this.putDailyStat(date, 'governance_total_events', '', value)
      return { meta: { changes: counts.size } }
    }

    if (sql.includes('INSERT INTO daily_stats') && sql.includes("'governance_scope'")) {
      const cutoff = String(args[0])
      for (const row of this.governanceRows.filter(item => String(item.occurred_at) < cutoff))
        this.incrementDailyStat(String(row.occurred_at).slice(0, 10), 'governance_scope', row.scope ?? '', 1)
      return { meta: { changes: 1 } }
    }

    if (sql.includes('INSERT INTO daily_stats') && sql.includes("'governance_action'")) {
      const cutoff = String(args[0])
      for (const row of this.governanceRows.filter(item => String(item.occurred_at) < cutoff))
        this.incrementDailyStat(String(row.occurred_at).slice(0, 10), 'governance_action', row.action ?? '', 1)
      return { meta: { changes: 1 } }
    }

    if (sql.includes('INSERT INTO daily_stats') && sql.includes("'governance_scope_action'")) {
      const cutoff = String(args[0])
      for (const row of this.governanceRows.filter(item => String(item.occurred_at) < cutoff))
        this.incrementDailyStat(String(row.occurred_at).slice(0, 10), 'governance_scope_action', `${row.scope ?? ''}:${row.action ?? ''}`, 1)
      return { meta: { changes: 1 } }
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
    if (sql.includes('FROM nexus_maintenance_state'))
      return this.maintenanceState.get(String(args[0])) ?? null

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

  private incrementDailyStat(date: string, statType: string, statKey: string, value: number) {
    const key = `${date}:${statType}:${statKey}`
    const current = this.dailyStats.get(key)?.value ?? 0
    this.dailyStats.set(key, { date, stat_type: statType, stat_key: statKey, value: current + value })
  }
}

const now = new Date('2026-06-15T00:00:00.000Z')

describe('telemetryRetentionMaintenance', () => {
  let db: MockD1Database

  beforeEach(() => {
    vi.useRealTimers()
    db = new MockD1Database()
    db.telemetryRows = [
      { id: 't1', created_at: '2026-05-01T00:00:00.000Z', event_type: 'performance' },
      { id: 't2', created_at: '2026-05-10T00:00:00.000Z', event_type: 'search' },
      { id: 't3', created_at: '2026-06-10T00:00:00.000Z', event_type: 'visit' },
    ]
    db.governanceRows = [
      { id: 'g1', created_at: '2026-04-01T00:00:00.000Z', occurred_at: '2026-04-01T00:00:00.000Z', scope: 'app', action: 'visit' },
      { id: 'g2', created_at: '2026-04-20T00:00:00.000Z', occurred_at: '2026-04-20T00:00:00.000Z', scope: 'plugin', action: 'install' },
      { id: 'g3', created_at: '2026-06-10T00:00:00.000Z', occurred_at: '2026-06-10T00:00:00.000Z', scope: 'app', action: 'search' },
    ]
  })

  it('claims due maintenance, compresses old detail rows, and schedules the next regular check', async () => {
    const result = await runTelemetryRetentionMaintenanceIfDue(db as any, { now })

    expect(result.status).toBe('completed')
    expect(result.nextRunAt).toBe('2026-06-15T06:00:00.000Z')
    expect(db.telemetryRows.map(row => row.id)).toEqual(['t3'])
    expect(db.governanceRows.map(row => row.id)).toEqual(['g3'])
    expect(db.dailyStats.get('2026-05-01:total_events:')?.value).toBe(1)
    expect(db.dailyStats.get('2026-05-10:events_by_type:search')?.value).toBe(1)
    expect(db.dailyStats.get('2026-04-01:governance_total_events:')?.value).toBe(1)
    expect(db.dailyStats.get('2026-04-20:governance_scope:plugin')?.value).toBe(1)
    expect(db.dailyStats.get('2026-04-01:governance_action:visit')?.value).toBe(1)
    expect(db.dailyStats.get('2026-04-20:governance_scope_action:plugin:install')?.value).toBe(1)
  })

  it('skips when the maintenance state is not due', async () => {
    await runTelemetryRetentionMaintenanceIfDue(db as any, { now })

    const skipped = await runTelemetryRetentionMaintenanceIfDue(db as any, { now })

    expect(skipped).toEqual({
      status: 'skipped',
      reason: 'not_due_or_locked',
      nextRunAt: '2026-06-15T06:00:00.000Z',
    })
  })

  it('schedules a short retry when a cleanup batch leaves backlog', async () => {
    db.telemetryRows = Array.from({ length: 10002 }, (_, index) => ({
      id: `t${index}`,
      created_at: index === 10001 ? '2026-06-10T00:00:00.000Z' : '2026-05-01T00:00:00.000Z',
      event_type: 'search',
    }))

    const result = await runTelemetryRetentionMaintenanceIfDue(db as any, { now })

    expect(result.status).toBe('completed')
    expect(result.nextRunAt).toBe('2026-06-15T00:05:00.000Z')
    expect(result.result?.tables[0]).toEqual(expect.objectContaining({
      table: 'telemetry_events',
      matched: 10001,
      deleted: 10000,
      remainingAfterBatch: 1,
    }))
  })
})
