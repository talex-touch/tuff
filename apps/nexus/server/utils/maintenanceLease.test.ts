import type { D1Database } from '@cloudflare/workers-types'
import type { SqliteD1Database } from '../../test/helpers/d1-sqlite'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSqliteD1 } from '../../test/helpers/d1-sqlite'

/** The maintenance lease against real SQLite: one claimant per interval, per key. */

let lease: typeof import('./maintenanceLease')
let d1: SqliteD1Database

/** Another isolate: its own binding object over the same database. */
function isolate(): D1Database {
  return { prepare: (sql: string) => d1.prepare(sql), batch: (statements: any[]) => d1.batch(statements) } as unknown as D1Database
}

function totalChanges(): number {
  return Number((d1.sqlite.prepare('SELECT total_changes() AS n').get() as { n: number }).n)
}

const T0 = new Date('2026-10-15T08:00:00.000Z')
const at = (seconds: number) => new Date(T0.getTime() + seconds * 1000)

beforeEach(async () => {
  vi.resetModules()
  lease = await import('./maintenanceLease')
  d1 = createSqliteD1()
})

afterEach(() => {
  d1.close()
})

describe('claimMaintenanceRun', () => {
  it('gives a due run to one claimant, and the next run an interval later', async () => {
    const first = isolate()
    const second = isolate()

    expect((await lease.claimMaintenanceRun(first, 'asr_result_cleanup', at(0), 60_000)).claimed).toBe(true)
    expect((await lease.claimMaintenanceRun(second, 'asr_result_cleanup', at(1), 60_000)).claimed).toBe(false)
    expect((await lease.claimMaintenanceRun(first, 'asr_result_cleanup', at(59), 60_000)).claimed).toBe(false)
    expect((await lease.claimMaintenanceRun(second, 'asr_result_cleanup', at(60), 60_000)).claimed).toBe(true)
  })

  it('writes nothing for a claim that does not win', async () => {
    await lease.claimMaintenanceRun(isolate(), 'asr_result_cleanup', at(0), 60_000)
    const before = totalChanges()

    await lease.claimMaintenanceRun(isolate(), 'asr_result_cleanup', at(1), 60_000)

    expect(totalChanges()).toBe(before)
  })

  it('keeps each key\'s lease to itself', async () => {
    const db = isolate()
    expect((await lease.claimMaintenanceRun(db, 'asr_result_cleanup', at(0), 60_000)).claimed).toBe(true)
    expect((await lease.claimMaintenanceRun(db, 'other_task', at(1), 60_000)).claimed).toBe(true)
  })
})

describe('holdMaintenanceRun', () => {
  it('keeps traffic claims away until the hold lapses, and says when that is', async () => {
    const db = isolate()
    await lease.holdMaintenanceRun(db, 'asr_result_cleanup', at(0), 600_000)

    expect(await lease.claimMaintenanceRun(db, 'asr_result_cleanup', at(120), 60_000)).toEqual({
      claimed: false,
      nextRunAt: at(600).toISOString(),
    })
    expect((await lease.claimMaintenanceRun(db, 'asr_result_cleanup', at(600), 60_000)).claimed).toBe(true)
  })

  it('takes the run even when a claim holds it', async () => {
    const db = isolate()
    await lease.claimMaintenanceRun(db, 'asr_result_cleanup', at(0), 60_000)
    await lease.holdMaintenanceRun(db, 'asr_result_cleanup', at(10), 600_000)

    expect(await lease.claimMaintenanceRun(db, 'asr_result_cleanup', at(70), 60_000)).toEqual({ claimed: false, nextRunAt: at(610).toISOString() })
  })
})
