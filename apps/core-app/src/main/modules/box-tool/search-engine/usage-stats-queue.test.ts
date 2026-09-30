import { describe, expect, it, vi } from 'vitest'

/**
 * A failing flush must not resurrect data an explicit clear() erased (#657).
 *
 * The snapshot is taken out of the queue before the write, so a failure restores it. If a privacy
 * or retention reset called clear() inside that window, the restore put back exactly the rows the
 * user asked to erase — and the `finally` block then scheduled a flush that persisted them.
 *
 * The queue is display-only now (effective executions go through the single deduped transaction in
 * `recordExecuteTransaction`), so these cases drive the search queue.
 */

const mocks = vi.hoisted(() => ({
  scheduleDbWrite: vi.fn(async () => undefined),
  queuedWrites: 0
}))

vi.mock('../../../db/db-write', () => ({
  scheduleDbWrite: mocks.scheduleDbWrite
}))

// importOriginal so DbWriteDroppedError stays the real class; the flush classifies by instanceof.
vi.mock('../../../db/db-write-scheduler', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  dbWriteScheduler: { getStats: () => ({ queued: mocks.queuedWrites }) }
}))

vi.mock('../../../utils/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() })
}))

import { DbWriteDroppedError } from '../../../db/db-write-scheduler'
import { UsageStatsQueue } from './usage-stats-queue'

type Testable = {
  searchQueue: Map<string, unknown>
  flushSearchQueue: () => Promise<void>
  clear: () => void
}

function createQueue(): Testable {
  return new UsageStatsQueue({} as never, { searchFlushIntervalMs: 60_000 }) as unknown as Testable
}

/** Seeds one display aggregate directly, so the test does not depend on the enqueue API's shape. */
function seedSearch(queue: Testable, itemId: string): void {
  queue.searchQueue.set(`app-provider:${itemId}`, {
    sourceId: 'app-provider',
    itemId,
    sourceType: 'app',
    searchCount: 1,
    lastSearched: new Date()
  })
}

describe('UsageStatsQueue display-count flush bookkeeping', () => {
  it('discards the snapshot when clear() ran while the write was in the air', async () => {
    const queue = createQueue()
    seedSearch(queue, 'com.apple.Safari')

    let releaseWrite: (() => void) | undefined
    mocks.scheduleDbWrite.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          releaseWrite = () => reject(new Error('disk full'))
        }) as never
    )

    const flushing = queue.flushSearchQueue()
    await Promise.resolve()

    // The user erases their history while the write is still in the air.
    queue.clear()
    releaseWrite?.()
    await flushing

    expect(queue.searchQueue.size).toBe(0)
  })

  it('merges back a real error whose message happens to say dropped', async () => {
    // #656: classification was `message.includes('dropped')`, so a driver error such as
    // 'connection dropped' was treated as a deliberate shed and the aggregated display events were
    // discarded at debug level.
    const queue = createQueue()
    seedSearch(queue, 'com.apple.Safari')

    mocks.scheduleDbWrite.mockImplementationOnce(async () => {
      throw new Error('connection dropped by peer')
    })

    await queue.flushSearchQueue()

    expect(queue.searchQueue.size).toBe(1)
  })

  it('discards the batch when the scheduler shed it on purpose', async () => {
    // The other side: a deliberate drop must still not be merged back, or the queue would grow
    // without bound exactly when the scheduler is trying to relieve pressure.
    const queue = createQueue()
    seedSearch(queue, 'com.apple.Safari')

    mocks.scheduleDbWrite.mockImplementationOnce(async () => {
      throw new DbWriteDroppedError('DB write task dropped after 10000ms queue wait: search')
    })

    await queue.flushSearchQueue()

    expect(queue.searchQueue.size).toBe(0)
  })

  it('still restores the snapshot when no clear intervened', async () => {
    // The other half. A fix that simply never merged back would satisfy the case above, and would
    // silently lose display data on every transient write failure.
    const queue = createQueue()
    seedSearch(queue, 'com.apple.Terminal')

    mocks.scheduleDbWrite.mockImplementationOnce(async () => {
      throw new Error('disk full')
    })

    await queue.flushSearchQueue()

    expect(queue.searchQueue.size).toBe(1)
  })
})
