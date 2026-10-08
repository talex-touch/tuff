import type { H3Event } from 'h3'
import type { SqliteD1Database } from '../../test/helpers/d1-sqlite'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSqliteD1 } from '../../test/helpers/d1-sqlite'

/**
 * The ASR result cleanup that ordinary traffic schedules, across isolates sharing one database: each
 * minute's run goes to one of them.
 */

let d1: SqliteD1Database

/** A request in another isolate: a fresh module (its own local throttle) and binding object. */
async function scheduleInIsolate(reconcile: () => Promise<unknown>) {
  vi.resetModules()
  const store = await import('./asrCleanupSchedule')
  let scheduled: Promise<unknown> | null = null
  const db = { prepare: (sql: string) => d1.prepare(sql), batch: (statements: any[]) => d1.batch(statements) }
  const event = {
    context: {
      cloudflare: { env: { DB: db } },
      waitUntil: (promise: Promise<unknown>) => {
        scheduled = promise
      },
    },
  } as unknown as H3Event
  store.scheduleExpiredAsrResultCleanup(event, reconcile)
  await scheduled
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-15T08:00:00.000Z'))
  d1 = createSqliteD1()
})

afterEach(() => {
  d1.close()
  vi.useRealTimers()
})

describe('scheduleExpiredAsrResultCleanup across isolates', () => {
  it('runs a minute\'s cleanup in one isolate, and the next minute\'s again', async () => {
    const runs: string[] = []

    await scheduleInIsolate(async () => runs.push('first'))
    vi.setSystemTime(new Date('2026-10-15T08:00:20.000Z'))
    await scheduleInIsolate(async () => runs.push('second'))
    expect(runs).toEqual(['first'])

    vi.setSystemTime(new Date('2026-10-15T08:01:00.000Z'))
    await scheduleInIsolate(async () => runs.push('third'))
    expect(runs).toEqual(['first', 'third'])
  })

  it('runs nothing from traffic while the maintenance Worker holds the lease, and checks again only when it is due', async () => {
    let leaseReads = 0
    const db = {
      prepare: (sql: string) => {
        if (sql.includes('SELECT next_run_at FROM nexus_maintenance_state'))
          leaseReads += 1
        return d1.prepare(sql)
      },
      batch: (statements: any[]) => d1.batch(statements),
    }
    vi.resetModules()
    const lease = await import('./maintenanceLease')
    await lease.holdMaintenanceRun(db as any, 'asr_result_cleanup', new Date('2026-10-15T08:00:00.000Z'), 10 * 60 * 1000)

    vi.resetModules()
    const store = await import('./asrCleanupSchedule')
    const runs: string[] = []
    const schedule = async () => {
      let scheduled: Promise<unknown> | null = null
      store.scheduleExpiredAsrResultCleanup({
        context: { cloudflare: { env: { DB: db } }, waitUntil: (promise: Promise<unknown>) => { scheduled = promise } },
      } as any, async () => runs.push('ran'))
      await scheduled
    }

    await schedule()
    vi.setSystemTime(new Date('2026-10-15T08:05:00.000Z'))
    await schedule()
    expect(runs).toEqual([])
    expect(leaseReads).toBe(1)

    vi.setSystemTime(new Date('2026-10-15T08:10:00.000Z'))
    await schedule()
    expect(runs).toEqual(['ran'])
  })
})
