import type { FileIndexProgress as FileIndexProgressPayload } from '@talex-touch/utils/transport/events/types'
import { describe, expect, it } from 'vitest'
import {
  getProgressStreamFlushDelayMs,
  resolveFileProviderOverallProgress,
  shouldEmitProgressStreamImmediately
} from './file-provider-progress-stream-service'

function createPayload(
  overrides: Partial<FileIndexProgressPayload> = {}
): FileIndexProgressPayload {
  const merged = {
    stage: 'indexing',
    current: 10,
    total: 100,
    progress: 0.1,
    startTime: null,
    estimatedRemainingMs: null,
    averageItemsPerSecond: 0,
    ...overrides
  }
  return {
    ...merged,
    startTime: merged.startTime ?? null,
    estimatedRemainingMs: merged.estimatedRemainingMs ?? null,
    averageItemsPerSecond: merged.averageItemsPerSecond ?? 0
  }
}

describe('file-provider-progress-stream-service', () => {
  it('adapts shared progress stream throttling to FileIndexProgress payloads', () => {
    expect(
      shouldEmitProgressStreamImmediately({
        previous: null,
        next: createPayload(),
        now: 1_000,
        lastEmitAt: 0
      })
    ).toBe(true)

    expect(
      shouldEmitProgressStreamImmediately({
        previous: createPayload({ stage: 'indexing' }),
        next: createPayload({ stage: 'completed' }),
        now: 1_000,
        lastEmitAt: 990
      })
    ).toBe(true)

    expect(
      shouldEmitProgressStreamImmediately({
        previous: createPayload({ current: 10, progress: 0.1, total: 100 }),
        next: createPayload({ current: 11, progress: 0.1, total: 100 }),
        now: 1_000,
        lastEmitAt: 910
      })
    ).toBe(false)
  })

  it('adapts shared flush delay calculation without negative delays', () => {
    expect(getProgressStreamFlushDelayMs(1_000, 900)).toBe(60)
    expect(getProgressStreamFlushDelayMs(1_000, 700)).toBe(0)
  })
})

describe('resolveFileProviderOverallProgress', () => {
  // Every call starts a fresh run (`previousStage: 'idle'`), so these rows pin the
  // stage band itself: cleanup [0,5], scanning [5,25], indexing [25,85], reconciliation [85,100].
  it.each([
    { name: 'cleanup start', stage: 'cleanup', current: 0, total: 10, expected: 0 },
    { name: 'cleanup middle', stage: 'cleanup', current: 5, total: 10, expected: 2.5 },
    { name: 'cleanup end', stage: 'cleanup', current: 10, total: 10, expected: 5 },
    { name: 'scanning start', stage: 'scanning', current: 0, total: 4, expected: 5 },
    { name: 'scanning middle', stage: 'scanning', current: 2, total: 4, expected: 15 },
    { name: 'scanning end', stage: 'scanning', current: 4, total: 4, expected: 25 },
    { name: 'indexing start', stage: 'indexing', current: 0, total: 8, expected: 25 },
    { name: 'indexing middle', stage: 'indexing', current: 4, total: 8, expected: 55 },
    { name: 'indexing end', stage: 'indexing', current: 8, total: 8, expected: 85 },
    { name: 'reconciliation start', stage: 'reconciliation', current: 0, total: 2, expected: 85 },
    {
      name: 'reconciliation middle',
      stage: 'reconciliation',
      current: 1,
      total: 2,
      expected: 92.5
    },
    { name: 'reconciliation end', stage: 'reconciliation', current: 2, total: 2, expected: 100 }
  ])(
    'maps $name onto the $expected% band of the overall run',
    ({ stage, current, total, expected }) => {
      expect(
        resolveFileProviderOverallProgress({
          stage,
          current,
          total,
          previousStage: 'idle',
          previousProgress: 0
        })
      ).toBe(expected)
    }
  )

  it('reports idle as 0 and completed as 100 no matter what the batch counters say', () => {
    expect(
      resolveFileProviderOverallProgress({
        stage: 'idle',
        current: 5,
        total: 10,
        previousStage: 'indexing',
        previousProgress: 73
      })
    ).toBe(0)

    expect(
      resolveFileProviderOverallProgress({
        stage: 'completed',
        current: 0,
        total: 0,
        previousStage: 'reconciliation',
        previousProgress: 99
      })
    ).toBe(100)
  })

  it('keeps the bar still when a batch counter restarts from total back to 0 inside one stage', () => {
    const afterFirstBatch = resolveFileProviderOverallProgress({
      stage: 'indexing',
      current: 100,
      total: 100,
      previousStage: 'indexing',
      previousProgress: 0
    })
    expect(afterFirstBatch).toBe(85)

    // Batch counters are stage-local and restart at 0; that must not drag the bar back to 25.
    expect(
      resolveFileProviderOverallProgress({
        stage: 'indexing',
        current: 0,
        total: 100,
        previousStage: 'indexing',
        previousProgress: afterFirstBatch
      })
    ).toBe(85)

    const partialScan = resolveFileProviderOverallProgress({
      stage: 'scanning',
      current: 20,
      total: 40,
      previousStage: 'scanning',
      previousProgress: 0
    })
    expect(partialScan).toBe(15)
    expect(
      resolveFileProviderOverallProgress({
        stage: 'scanning',
        current: 0,
        total: 40,
        previousStage: 'scanning',
        previousProgress: partialScan
      })
    ).toBe(15)
  })

  it('advances monotonically from indexing into reconciliation', () => {
    let progress = 0

    progress = resolveFileProviderOverallProgress({
      stage: 'indexing',
      current: 100,
      total: 100,
      previousStage: 'indexing',
      previousProgress: progress
    })
    expect(progress).toBe(85)

    // Reconciliation starts with a fresh counter, so it must not fall back to 85-15.
    progress = resolveFileProviderOverallProgress({
      stage: 'reconciliation',
      current: 0,
      total: 100,
      previousStage: 'indexing',
      previousProgress: progress
    })
    expect(progress).toBe(85)

    progress = resolveFileProviderOverallProgress({
      stage: 'reconciliation',
      current: 50,
      total: 100,
      previousStage: 'reconciliation',
      previousProgress: progress
    })
    expect(progress).toBe(92.5)

    progress = resolveFileProviderOverallProgress({
      stage: 'completed',
      current: 1,
      total: 1,
      previousStage: 'reconciliation',
      previousProgress: progress
    })
    expect(progress).toBe(100)
  })

  it('restarts from zero only once the run reports idle', () => {
    // `idle` is the explicit "nothing is indexing" boundary, so the stored floor is discarded.
    expect(
      resolveFileProviderOverallProgress({
        stage: 'cleanup',
        current: 5,
        total: 10,
        previousStage: 'idle',
        previousProgress: 0
      })
    ).toBe(2.5)

    expect(
      resolveFileProviderOverallProgress({
        stage: 'cleanup',
        current: 5,
        total: 10,
        previousStage: 'idle',
        previousProgress: 100
      })
    ).toBe(2.5)
  })

  // Back-to-back indexing runs are one continuous session: a pass that just reported `completed`
  // must not drag the bar back to the stage start on the next run's first batch.
  it.each([
    { name: 'cleanup', stage: 'cleanup', current: 0, total: 10 },
    { name: 'scanning', stage: 'scanning', current: 0, total: 4 },
    { name: 'indexing', stage: 'indexing', current: 3, total: 8 }
  ])(
    'keeps the accumulated high-water mark when the next run starts at $name',
    ({ stage, current, total }) => {
      expect(
        resolveFileProviderOverallProgress({
          stage,
          current,
          total,
          previousStage: 'completed',
          previousProgress: 100
        })
      ).toBe(100)
    }
  )

  it('clamps counter noise into the stage band instead of emitting NaN or out-of-range values', () => {
    const scanning = { previousStage: 'scanning', previousProgress: 0 }

    // A stage that has not reported a total yet must sit at its start, not divide by zero.
    expect(
      resolveFileProviderOverallProgress({ stage: 'indexing', current: 5, total: 0, ...scanning })
    ).toBe(25)
    // Workers can over-report or report negative deltas.
    expect(
      resolveFileProviderOverallProgress({
        stage: 'indexing',
        current: 120,
        total: 100,
        ...scanning
      })
    ).toBe(85)
    expect(
      resolveFileProviderOverallProgress({
        stage: 'indexing',
        current: -20,
        total: 100,
        ...scanning
      })
    ).toBe(25)
    // The final stage can never report past 100.
    expect(
      resolveFileProviderOverallProgress({
        stage: 'reconciliation',
        current: 200,
        total: 100,
        previousStage: 'indexing',
        previousProgress: 90
      })
    ).toBe(100)
  })
})
