import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  IndexMaintenanceNotification,
  IndexMaintenanceSlice
} from './index-maintenance-context'
import type { SourceScopedIndexWriterRouter } from './search-index-writer'

const state = vi.hoisted(() => ({
  getStartupDegradeWindowRemainingMs: vi.fn<() => number>(),
  isIndexMaintenanceIdle: vi.fn<() => boolean>()
}))

vi.mock('../../../db/runtime-flags', () => ({
  getStartupDegradeWindowRemainingMs: state.getStartupDegradeWindowRemainingMs
}))

vi.mock('./search-activity', () => ({
  isIndexMaintenanceIdle: state.isIndexMaintenanceIdle
}))

import {
  INDEX_MAINTENANCE_ACTIVE_DELAY_MS,
  INDEX_MAINTENANCE_COMPLETE_DELAY_MS,
  INDEX_MAINTENANCE_FAILURE_MAX_DELAY_MS,
  INDEX_MAINTENANCE_INITIAL_MIN_DELAY_MS,
  IndexMaintenanceRunner,
  resolveIndexMaintenanceFailureDelayMs
} from './index-maintenance-runner'

interface MockWriter {
  runIndexMaintenanceSlice: ReturnType<
    typeof vi.fn<
      (sourceId: string, limit?: number, signal?: AbortSignal) => Promise<IndexMaintenanceSlice>
    >
  >
  publishExternalCommit: ReturnType<
    typeof vi.fn<
      (sourceId: string, kind: 'cleanup', affectedItems: number) => Promise<{ committed: boolean }>
    >
  >
  acknowledgeIndexMaintenanceCommit: ReturnType<
    typeof vi.fn<
      (
        ownerSourceId: string,
        notification: IndexMaintenanceNotification,
        signal?: AbortSignal
      ) => Promise<void>
    >
  >
}

function createMockWriter(): MockWriter {
  return {
    runIndexMaintenanceSlice: vi.fn(async () => ({
      processed: 0,
      done: false,
      deferred: false,
      notifications: []
    })),
    publishExternalCommit: vi.fn(async () => ({ committed: true })),
    acknowledgeIndexMaintenanceCommit: vi.fn(async () => undefined)
  }
}

describe('IndexMaintenanceRunner', () => {
  let runner: IndexMaintenanceRunner | null = null

  beforeEach(() => {
    vi.useFakeTimers()
    state.getStartupDegradeWindowRemainingMs.mockReset().mockReturnValue(0)
    state.isIndexMaintenanceIdle.mockReset().mockReturnValue(true)
  })

  afterEach(() => {
    runner?.stop()
    runner = null
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it('computes bounded exponential failure delays capped at 60s', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 50].map(resolveIndexMaintenanceFailureDelayMs)).toEqual([
      1_000,
      2_000,
      4_000,
      8_000,
      16_000,
      32_000,
      INDEX_MAINTENANCE_FAILURE_MAX_DELAY_MS,
      INDEX_MAINTENANCE_FAILURE_MAX_DELAY_MS,
      INDEX_MAINTENANCE_FAILURE_MAX_DELAY_MS
    ])
  })

  it('backs off exponentially up to 60s on repeated slice failures instead of looping every 250ms', async () => {
    const writer = createMockWriter()
    const error = new Error('SQLITE_FULL')
    writer.runIndexMaintenanceSlice.mockRejectedValue(error)
    const onFailure = vi.fn()

    runner = new IndexMaintenanceRunner({
      sourceId: 'file-provider',
      getWriter: () => writer as unknown as SourceScopedIndexWriterRouter,
      isAllowed: () => true,
      onFailure
    })

    runner.start()
    await vi.advanceTimersByTimeAsync(INDEX_MAINTENANCE_INITIAL_MIN_DELAY_MS)
    expect(writer.runIndexMaintenanceSlice).toHaveBeenCalledTimes(1)
    expect(onFailure).toHaveBeenCalledTimes(1)
    expect(onFailure).toHaveBeenLastCalledWith(error)

    const expectedBackoffs = [1_000, 2_000, 4_000, 8_000, 16_000, 32_000, 60_000, 60_000]
    for (let index = 0; index < expectedBackoffs.length; index += 1) {
      const delayMs = expectedBackoffs[index]!
      await vi.advanceTimersByTimeAsync(delayMs - 1)
      expect(writer.runIndexMaintenanceSlice).toHaveBeenCalledTimes(index + 1)
      expect(onFailure).toHaveBeenCalledTimes(index + 1)

      await vi.advanceTimersByTimeAsync(1)
      expect(writer.runIndexMaintenanceSlice).toHaveBeenCalledTimes(index + 2)
      expect(onFailure).toHaveBeenCalledTimes(index + 2)
    }
  })

  it('backs off exponentially when commit publication or acknowledgement repeatedly fails', async () => {
    const writer = createMockWriter()
    const notification: IndexMaintenanceNotification = {
      commitKey: 'commit-1',
      sourceId: 'file-provider',
      affectedItems: 12
    }
    writer.runIndexMaintenanceSlice.mockResolvedValue({
      processed: 0,
      done: false,
      deferred: false,
      notifications: [notification]
    })
    writer.publishExternalCommit
      .mockResolvedValueOnce({ committed: false })
      .mockResolvedValueOnce({ committed: false })
      .mockResolvedValue({ committed: true })
    const ackError = new Error('ACK_BUSY')
    writer.acknowledgeIndexMaintenanceCommit.mockRejectedValue(ackError)
    const onFailure = vi.fn()

    runner = new IndexMaintenanceRunner({
      sourceId: 'file-provider',
      getWriter: () => writer as unknown as SourceScopedIndexWriterRouter,
      isAllowed: () => true,
      onFailure
    })

    runner.start()
    await vi.advanceTimersByTimeAsync(INDEX_MAINTENANCE_INITIAL_MIN_DELAY_MS)
    expect(onFailure).toHaveBeenCalledTimes(1)

    // Failure #1 -> 1_000ms
    await vi.advanceTimersByTimeAsync(999)
    expect(onFailure).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(onFailure).toHaveBeenCalledTimes(2)

    // Failure #2 -> 2_000ms (proves pending-notification slice did not reset failure count early)
    await vi.advanceTimersByTimeAsync(1_999)
    expect(onFailure).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(1)
    expect(onFailure).toHaveBeenCalledTimes(3)
    expect(onFailure).toHaveBeenLastCalledWith(ackError)

    // Failure #3 (ack failure) -> 4_000ms
    await vi.advanceTimersByTimeAsync(3_999)
    expect(onFailure).toHaveBeenCalledTimes(3)
    await vi.advanceTimersByTimeAsync(1)
    expect(onFailure).toHaveBeenCalledTimes(4)
  })

  it('resets backoff after a clean slice so healthy work resumes 250ms cadence and 60s when done', async () => {
    const writer = createMockWriter()
    const onFailure = vi.fn()
    writer.runIndexMaintenanceSlice
      .mockRejectedValueOnce(new Error('fail-1'))
      .mockRejectedValueOnce(new Error('fail-2'))
      .mockRejectedValueOnce(new Error('fail-3'))
      // Tick 4: healthy incomplete slice (processed=0 breaks the in-tick loop after 1 slice)
      .mockResolvedValueOnce({
        processed: 0,
        done: false,
        deferred: false,
        notifications: []
      })
      // Tick 5 (250ms later): healthy completed slice -> 60_000ms
      .mockResolvedValueOnce({
        processed: 12,
        done: true,
        deferred: false,
        notifications: []
      })
      // Tick 6 (60_000ms later): fails again -> starts fresh at 1_000ms, not 8_000ms
      .mockRejectedValueOnce(new Error('fail-after-recovery'))
      .mockResolvedValue({
        processed: 0,
        done: true,
        deferred: false,
        notifications: []
      })

    runner = new IndexMaintenanceRunner({
      sourceId: 'file-provider',
      getWriter: () => writer as unknown as SourceScopedIndexWriterRouter,
      isAllowed: () => true,
      onFailure
    })

    runner.start()
    await vi.advanceTimersByTimeAsync(INDEX_MAINTENANCE_INITIAL_MIN_DELAY_MS)
    expect(onFailure).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(1_000)
    expect(onFailure).toHaveBeenCalledTimes(2)

    await vi.advanceTimersByTimeAsync(2_000)
    expect(onFailure).toHaveBeenCalledTimes(3)

    // After 4_000ms backoff, slice 4 succeeds with done=false -> resets consecutiveFailures to 0
    await vi.advanceTimersByTimeAsync(4_000)
    expect(writer.runIndexMaintenanceSlice).toHaveBeenCalledTimes(4)
    expect(onFailure).toHaveBeenCalledTimes(3)

    // Resumes 250ms cadence for incomplete healthy work
    await vi.advanceTimersByTimeAsync(INDEX_MAINTENANCE_ACTIVE_DELAY_MS - 1)
    expect(writer.runIndexMaintenanceSlice).toHaveBeenCalledTimes(4)
    await vi.advanceTimersByTimeAsync(1)
    expect(writer.runIndexMaintenanceSlice).toHaveBeenCalledTimes(5)

    // Slice 5 returned done=true -> schedules at 60_000ms
    await vi.advanceTimersByTimeAsync(INDEX_MAINTENANCE_COMPLETE_DELAY_MS - 1)
    expect(writer.runIndexMaintenanceSlice).toHaveBeenCalledTimes(5)
    await vi.advanceTimersByTimeAsync(1)
    expect(writer.runIndexMaintenanceSlice).toHaveBeenCalledTimes(6)
    expect(onFailure).toHaveBeenCalledTimes(4)

    // Post-recovery failure backs off from 1_000ms again
    await vi.advanceTimersByTimeAsync(999)
    expect(writer.runIndexMaintenanceSlice).toHaveBeenCalledTimes(6)
    await vi.advanceTimersByTimeAsync(1)
    expect(writer.runIndexMaintenanceSlice).toHaveBeenCalledTimes(7)
  })

  it('preserves consecutive failure count across non-idle skips and deferred slices while re-probing at 250ms', async () => {
    const writer = createMockWriter()
    let allowed = true
    const onFailure = vi.fn()
    writer.runIndexMaintenanceSlice
      .mockRejectedValueOnce(new Error('fail-1'))
      .mockRejectedValueOnce(new Error('fail-2'))
      .mockResolvedValueOnce({
        processed: 0,
        done: false,
        deferred: true,
        notifications: []
      })
      .mockRejectedValueOnce(new Error('fail-3'))

    runner = new IndexMaintenanceRunner({
      sourceId: 'file-provider',
      getWriter: () => writer as unknown as SourceScopedIndexWriterRouter,
      isAllowed: () => allowed,
      onFailure
    })

    runner.start()
    await vi.advanceTimersByTimeAsync(INDEX_MAINTENANCE_INITIAL_MIN_DELAY_MS)
    expect(onFailure).toHaveBeenCalledTimes(1)

    // Failure #2 after 1_000ms -> schedules 2_000ms with consecutiveFailures = 2
    await vi.advanceTimersByTimeAsync(1_000)
    expect(onFailure).toHaveBeenCalledTimes(2)

    // When the 2_000ms backoff expires, foreground activity blocks maintenance
    state.isIndexMaintenanceIdle.mockReturnValue(false)
    await vi.advanceTimersByTimeAsync(2_000)
    expect(writer.runIndexMaintenanceSlice).toHaveBeenCalledTimes(2)

    // Next 250ms probe: idle again, but isAllowed() is false -> still skipped without resetting streak
    state.isIndexMaintenanceIdle.mockReturnValue(true)
    allowed = false
    await vi.advanceTimersByTimeAsync(INDEX_MAINTENANCE_ACTIVE_DELAY_MS)
    expect(writer.runIndexMaintenanceSlice).toHaveBeenCalledTimes(2)

    // Next 250ms probe: allowed again, but slice returns deferred=true -> re-probes in 250ms, keeps streak
    allowed = true
    await vi.advanceTimersByTimeAsync(INDEX_MAINTENANCE_ACTIVE_DELAY_MS)
    expect(writer.runIndexMaintenanceSlice).toHaveBeenCalledTimes(3)
    expect(onFailure).toHaveBeenCalledTimes(2)

    // Next 250ms probe: real slice fails -> escalates to 4_000ms (failure #3), NOT 1_000ms
    await vi.advanceTimersByTimeAsync(INDEX_MAINTENANCE_ACTIVE_DELAY_MS)
    expect(writer.runIndexMaintenanceSlice).toHaveBeenCalledTimes(4)
    expect(onFailure).toHaveBeenCalledTimes(3)

    await vi.advanceTimersByTimeAsync(3_999)
    expect(writer.runIndexMaintenanceSlice).toHaveBeenCalledTimes(4)
    await vi.advanceTimersByTimeAsync(1)
    expect(writer.runIndexMaintenanceSlice).toHaveBeenCalledTimes(5)
  })

  it('resets prior failure count if an earlier slice in the same tick succeeded before a later slice failed', async () => {
    const writer = createMockWriter()
    const onFailure = vi.fn()
    writer.runIndexMaintenanceSlice
      .mockRejectedValueOnce(new Error('fail-1'))
      .mockRejectedValueOnce(new Error('fail-2'))
      // Same tick: slice 0 succeeds with work, slice 1 throws
      .mockResolvedValueOnce({
        processed: 64,
        done: false,
        deferred: false,
        notifications: []
      })
      .mockRejectedValueOnce(new Error('fail-after-progress'))
      .mockResolvedValue({
        processed: 0,
        done: true,
        deferred: false,
        notifications: []
      })

    runner = new IndexMaintenanceRunner({
      sourceId: 'file-provider',
      getWriter: () => writer as unknown as SourceScopedIndexWriterRouter,
      isAllowed: () => true,
      onFailure
    })

    runner.start()
    await vi.advanceTimersByTimeAsync(INDEX_MAINTENANCE_INITIAL_MIN_DELAY_MS)
    await vi.advanceTimersByTimeAsync(1_000)
    expect(onFailure).toHaveBeenCalledTimes(2)

    // After 2_000ms: slice 0 succeeds (resets streak), slice 1 throws -> consecutiveFailures = 1 (1_000ms)
    await vi.advanceTimersByTimeAsync(2_000)
    expect(writer.runIndexMaintenanceSlice).toHaveBeenCalledTimes(4)
    expect(onFailure).toHaveBeenCalledTimes(3)

    await vi.advanceTimersByTimeAsync(999)
    expect(writer.runIndexMaintenanceSlice).toHaveBeenCalledTimes(4)
    await vi.advanceTimersByTimeAsync(1)
    expect(writer.runIndexMaintenanceSlice).toHaveBeenCalledTimes(5)
  })

  it('does not call onFailure or reschedule when stopped mid-run, and starts fresh on restart', async () => {
    const writer = createMockWriter()
    const onFailure = vi.fn()
    const sliceStarted = Promise.withResolvers<void>()
    const rejectSlice = Promise.withResolvers<IndexMaintenanceSlice>()

    writer.runIndexMaintenanceSlice
      .mockRejectedValueOnce(new Error('fail-before-stop-1'))
      .mockRejectedValueOnce(new Error('fail-before-stop-2'))
      .mockImplementationOnce(async (_sourceId, _limit, signal) => {
        expect(signal?.aborted).toBe(false)
        sliceStarted.resolve()
        return await rejectSlice.promise
      })
      .mockRejectedValueOnce(new Error('fail-after-restart'))

    runner = new IndexMaintenanceRunner({
      sourceId: 'file-provider',
      getWriter: () => writer as unknown as SourceScopedIndexWriterRouter,
      isAllowed: () => true,
      onFailure
    })

    runner.start()
    await vi.advanceTimersByTimeAsync(INDEX_MAINTENANCE_INITIAL_MIN_DELAY_MS)
    await vi.advanceTimersByTimeAsync(1_000)
    expect(onFailure).toHaveBeenCalledTimes(2)

    // Trigger 3rd run after 2_000ms and stop while in flight
    const advance = vi.advanceTimersByTimeAsync(2_000)
    await sliceStarted.promise
    runner.stop()
    expect(vi.getTimerCount()).toBe(0)

    rejectSlice.reject(new Error('aborted-slice-failure'))
    await advance

    expect(onFailure).toHaveBeenCalledTimes(2)
    expect(vi.getTimerCount()).toBe(0)

    await vi.advanceTimersByTimeAsync(60_000)
    expect(writer.runIndexMaintenanceSlice).toHaveBeenCalledTimes(3)

    // Restarting resets consecutiveFailures to 0, so a new failure backs off 1_000ms
    runner.start()
    await vi.advanceTimersByTimeAsync(INDEX_MAINTENANCE_INITIAL_MIN_DELAY_MS)
    expect(onFailure).toHaveBeenCalledTimes(3)

    await vi.advanceTimersByTimeAsync(999)
    expect(writer.runIndexMaintenanceSlice).toHaveBeenCalledTimes(4)
    await vi.advanceTimersByTimeAsync(1)
    expect(writer.runIndexMaintenanceSlice).toHaveBeenCalledTimes(5)
  })
})
