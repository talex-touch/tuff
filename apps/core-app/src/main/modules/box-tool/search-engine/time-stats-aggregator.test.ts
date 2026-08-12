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

// Enough of the operators to let the fake db see which keyset cursor was asked
// for. `sql` stays real — the upsert's excluded.* references go through it.
vi.mock('drizzle-orm', async (importOriginal) => {
  const actual = await importOriginal<typeof import('drizzle-orm')>()
  return {
    ...actual,
    and: (...conditions: unknown[]) => Object.assign({}, ...conditions.filter(Boolean)),
    eq: () => ({}),
    asc: () => ({}),
    gt: (_column: unknown, value: number) => ({ __afterId: value })
  }
})

const transaction = vi.fn()
const insertedChunks: Array<unknown[]> = []
/** Rows handed to the aggregator per read, in order — one entry per page. */
const readPageSizes: number[] = []

type LogRow = { id: number; sourceId: string; itemId: string; timestamp: Date }

/**
 * Models keyset pagination rather than returning everything: the aggregator is
 * expected to walk `id > lastId ... LIMIT n`, so the mock has to honour both or
 * the paging under test is not actually exercised (#660).
 */
function makeDb(logs: LogRow[]) {
  let pendingAfterId = 0
  let pendingLimit = Number.POSITIVE_INFINITY

  const query = {
    select: () => query,
    from: () => query,
    where: (condition: unknown) => {
      pendingAfterId = (condition as { __afterId?: number })?.__afterId ?? 0
      return query
    },
    orderBy: () => query,
    limit: (n: number) => {
      pendingLimit = n
      return query
    },
    all: async () => {
      const page = logs.filter((row) => row.id > pendingAfterId).slice(0, pendingLimit)
      readPageSizes.push(page.length)
      pendingAfterId = 0
      pendingLimit = Number.POSITIVE_INFINITY
      return page
    },
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

function makeLogs(itemCount: number): LogRow[] {
  return Array.from({ length: itemCount }, (_, i) => ({
    id: i + 1,
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
    readPageSizes.length = 0
  })

  it('never materialises the whole log table in one read', async () => {
    await runRebuild(12_000)

    // 12,000 rows at a 5,000 page cap => 5,000 + 5,000 + 2,000, then stop:
    // the short final page ends the walk without a further empty round trip.
    expect(readPageSizes).toEqual([5000, 5000, 2000])
    for (const size of readPageSizes) {
      expect(size).toBeLessThanOrEqual(5000)
    }
  })

  it('reads one more page when the last one is exactly full', async () => {
    await runRebuild(10_000)

    expect(readPageSizes).toEqual([5000, 5000, 0])
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
