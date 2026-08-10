import type { DbUtils } from '../../../db/utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The rebuild used to run every upsert inside one `db.transaction`, awaiting
 * `setImmediate` every 20 rows. Yielding there keeps the WAL writer lock held
 * while unrelated main-process work runs, so the search-index worker's
 * concurrent writes hit SQLITE_BUSY for the whole rebuild rather than for one
 * short transaction (#659). What these tests pin is the structural property:
 * bounded chunks, one scheduled write each, and no transaction spanning them.
 */

const scheduleDbWrite = vi.fn(
  async (_name: string, run: () => unknown | Promise<unknown>) => await run()
)

vi.mock('../../../db/db-write', () => ({
  scheduleDbWrite: (...args: Parameters<typeof scheduleDbWrite>) => scheduleDbWrite(...args)
}))

vi.mock('../../../utils/perf-context', () => ({
  enterPerfContext: () => () => {}
}))

const transaction = vi.fn()
const insertedChunks: Array<unknown[]> = []

function makeDb(logs: Array<{ sourceId: string; itemId: string; timestamp: Date }>) {
  const query = {
    select: () => query,
    from: () => query,
    where: () => query,
    orderBy: () => query,
    all: async () => logs,
    transaction,
    insert: () => ({
      values: (chunk: unknown[]) => {
        insertedChunks.push(chunk)
        return { onConflictDoUpdate: async () => undefined }
      }
    })
  }
  return query
}

function makeLogs(itemCount: number) {
  return Array.from({ length: itemCount }, (_, i) => ({
    sourceId: 'source',
    itemId: `item-${i}`,
    timestamp: new Date(2026, 0, 1, 9, 0, 0)
  }))
}

async function runRebuild(itemCount: number) {
  const { TimeStatsAggregator } = await import('./time-stats-aggregator')
  const dbUtils = { getDb: () => makeDb(makeLogs(itemCount)) } as unknown as DbUtils
  await new TimeStatsAggregator(dbUtils).aggregateTimeStats({ force: true })
}

describe('TimeStatsAggregator rebuild write shape', () => {
  beforeEach(() => {
    scheduleDbWrite.mockClear()
    transaction.mockClear()
    insertedChunks.length = 0
  })

  it('never opens a transaction that spans the whole rebuild', async () => {
    await runRebuild(1200)
    expect(transaction).not.toHaveBeenCalled()
  })

  it('splits the upserts into bounded chunks, one scheduled write each', async () => {
    await runRebuild(1200)

    // 1200 distinct items at a 500 chunk cap => 500 + 500 + 200.
    expect(insertedChunks.map((chunk) => chunk.length)).toEqual([500, 500, 200])
    expect(scheduleDbWrite).toHaveBeenCalledTimes(3)
    for (const chunk of insertedChunks) {
      expect(chunk.length).toBeLessThanOrEqual(500)
    }
  })

  it('still writes every item exactly once', async () => {
    await runRebuild(1200)

    const written = insertedChunks.flat() as Array<{ itemId: string }>
    expect(written).toHaveLength(1200)
    expect(new Set(written.map((row) => row.itemId)).size).toBe(1200)
  })

  it('does not chunk a rebuild that fits in one write', async () => {
    await runRebuild(10)

    expect(scheduleDbWrite).toHaveBeenCalledTimes(1)
    expect(insertedChunks[0]).toHaveLength(10)
  })
})
