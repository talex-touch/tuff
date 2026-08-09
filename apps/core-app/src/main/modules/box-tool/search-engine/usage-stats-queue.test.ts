import { describe, expect, it, vi } from 'vitest'

/**
 * A failing flush must not resurrect data an explicit clear() erased (#657).
 *
 * The snapshot is taken out of the queue before the write, so a failure restores it. If a privacy
 * or retention reset called clear() inside that window, the restore put back exactly the rows the
 * user asked to erase — and the `finally` block then scheduled a flush that persisted them.
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
import { createEmptyTimeBuckets } from './item-time-stats-buckets'
import { UsageStatsQueue } from './usage-stats-queue'

type Testable = {
  actionQueue: Map<string, unknown>
  searchQueue: Map<string, unknown>
  pendingActionEvents: number
  flushActionQueue: () => Promise<void>
  flushSearchQueue: () => Promise<void>
  clear: () => void
}

function createQueue(): Testable {
  return new UsageStatsQueue({} as never, {
    searchFlushIntervalMs: 60_000,
    actionFlushIntervalMs: 60_000
  }) as unknown as Testable
}

/** Seeds one aggregate directly, so the test does not depend on the record-event API's shape. */
function seedAction(queue: Testable, itemId: string): void {
  queue.actionQueue.set(`app-provider:${itemId}`, {
    sourceId: 'app-provider',
    itemId,
    sourceType: 'app',
    searchCount: 0,
    executeCount: 1,
    cancelCount: 0,
    clickCount: 0,
    lastUsed: new Date(),
    keywords: [],
    timeBuckets: createEmptyTimeBuckets()
  })
  queue.pendingActionEvents = 1
}

describe('UsageStatsQueue clear during an in-flight flush', () => {
  it('discards the snapshot when clear() ran while the write was in the air', async () => {
    const queue = createQueue()
    seedAction(queue, 'com.apple.Safari')

    let releaseWrite: (() => void) | undefined
    mocks.scheduleDbWrite.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          releaseWrite = () => reject(new Error('disk full'))
        }) as never
    )

    const flushing = queue.flushActionQueue()
    await Promise.resolve()

    // The user erases their history while the write is still in the air.
    queue.clear()
    releaseWrite?.()
    await flushing

    expect(queue.actionQueue.size).toBe(0)
    expect(queue.pendingActionEvents).toBe(0)
  })

  it('merges back a real error whose message happens to say dropped', async () => {
    // #656: classification was `message.includes('dropped')`, so a driver error such as
    // 'connection dropped' was treated as a deliberate shed and up to 2,000 aggregated search
    // events were discarded at debug level.
    const queue = createQueue()
    queue.searchQueue.set('app-provider:com.apple.Safari', {
      sourceId: 'app-provider',
      itemId: 'com.apple.Safari',
      sourceType: 'app',
      searchCount: 1,
      executeCount: 0,
      cancelCount: 0,
      clickCount: 0,
      lastUsed: new Date(),
      keywords: ['saf'],
      timeBuckets: createEmptyTimeBuckets()
    })

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
    queue.searchQueue.set('app-provider:com.apple.Safari', {
      sourceId: 'app-provider',
      itemId: 'com.apple.Safari',
      sourceType: 'app',
      searchCount: 1,
      executeCount: 0,
      cancelCount: 0,
      clickCount: 0,
      lastUsed: new Date(),
      keywords: ['saf'],
      timeBuckets: createEmptyTimeBuckets()
    })

    mocks.scheduleDbWrite.mockImplementationOnce(async () => {
      throw new DbWriteDroppedError('DB write task dropped after 10000ms queue wait: search')
    })

    await queue.flushSearchQueue()

    expect(queue.searchQueue.size).toBe(0)
  })

  it('still restores the snapshot when no clear intervened', async () => {
    // The other half. A fix that simply never merged back would satisfy the case above, and would
    // silently lose usage data on every transient write failure.
    const queue = createQueue()
    seedAction(queue, 'com.apple.Terminal')

    mocks.scheduleDbWrite.mockImplementationOnce(async () => {
      throw new Error('disk full')
    })

    await queue.flushActionQueue()

    expect(queue.actionQueue.size).toBe(1)
    expect(queue.pendingActionEvents).toBe(1)
  })

  it('applies the same rule to the search queue', async () => {
    const queue = createQueue()
    queue.searchQueue.set('app-provider:com.apple.Safari', {
      sourceId: 'app-provider',
      itemId: 'com.apple.Safari',
      sourceType: 'app',
      searchCount: 1,
      executeCount: 0,
      cancelCount: 0,
      clickCount: 0,
      lastUsed: new Date(),
      keywords: ['saf'],
      timeBuckets: createEmptyTimeBuckets()
    })

    let releaseWrite: (() => void) | undefined
    mocks.scheduleDbWrite.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          releaseWrite = () => reject(new Error('disk full'))
        }) as never
    )

    const flushing = queue.flushSearchQueue()
    await Promise.resolve()
    queue.clear()
    releaseWrite?.()
    await flushing

    expect(queue.searchQueue.size).toBe(0)
  })
})
