import { describe, expect, it } from "vitest";
import { IndexingProgressEstimatorService } from "../../search";

type TestProgressStage = "idle" | "scanning" | "indexing" | "completed";

describe('indexing-progress-estimator-service', () => {
  it('waits for enough progress before returning ETA', () => {
    const estimator = new IndexingProgressEstimatorService<TestProgressStage>({
      terminalStages: ['idle', 'completed'],
      completedStages: ['completed']
    })

    expect(
      estimator.update({
        stage: 'indexing',
        current: 0,
        total: 100,
        now: 1_000
      }).estimatedRemainingMs
    ).toBeNull()

    expect(
      estimator.update({
        stage: 'indexing',
        current: 2,
        total: 100,
        now: 2_000
      }).estimatedRemainingMs
    ).toBeNull()
    expect(estimator.getEstimate().status).toBe('stabilizing')
  })

  it('estimates remaining time from smoothed stage speed', () => {
    const estimator = new IndexingProgressEstimatorService<TestProgressStage>()
    estimator.update({ stage: 'indexing', current: 0, total: 100, now: 1_000 })
    estimator.update({ stage: 'indexing', current: 10, total: 100, now: 2_000 })
    const estimate = estimator.update({ stage: 'indexing', current: 20, total: 100, now: 3_000 })

    expect(estimate.averageItemsPerSecond).toBeGreaterThan(0)
    expect(estimate.estimatedRemainingMs).toBeGreaterThan(0)
    expect(estimate.estimatedRemainingMs).toBeLessThan(20_000)
    expect(estimate.status).toBe('estimated')
    expect(estimate.speedSampleCount).toBe(2)
  })

  it('resets sampling when stage changes to avoid cross-stage jumps', () => {
    const estimator = new IndexingProgressEstimatorService<TestProgressStage>()
    estimator.update({ stage: 'scanning', current: 0, total: 10, now: 1_000 })
    estimator.update({ stage: 'scanning', current: 10, total: 10, now: 2_000 })

    const next = estimator.update({ stage: 'indexing', current: 0, total: 500, now: 3_000 })

    expect(next.averageItemsPerSecond).toBe(0)
    expect(next.estimatedRemainingMs).toBeNull()
  })

  it('resets sampling when stage progress moves backwards', () => {
    const estimator = new IndexingProgressEstimatorService<TestProgressStage>()
    estimator.update({ stage: 'indexing', current: 0, total: 100, now: 1_000 })
    estimator.update({ stage: 'indexing', current: 30, total: 100, now: 2_000 })

    const next = estimator.update({ stage: 'indexing', current: 5, total: 100, now: 3_000 })

    expect(next.averageItemsPerSecond).toBe(0)
    expect(next.estimatedRemainingMs).toBeNull()
  })

  it('returns zero remaining time on completed and clears speed', () => {
    const estimator = new IndexingProgressEstimatorService<TestProgressStage>({
      terminalStages: ['idle', 'completed'],
      completedStages: ['completed']
    })
    estimator.update({ stage: 'indexing', current: 0, total: 100, now: 1_000 })
    estimator.update({ stage: 'indexing', current: 20, total: 100, now: 2_000 })

    expect(
      estimator.update({
        stage: 'completed',
        current: 1,
        total: 1,
        now: 3_000
      })
    ).toEqual({
      estimatedRemainingMs: 0,
      averageItemsPerSecond: 0,
      status: 'complete',
      speedSampleCount: 0,
      estimateBasis: 'complete'
    })
  })

  it('returns null remaining time on non-completed terminal stages', () => {
    const estimator = new IndexingProgressEstimatorService<TestProgressStage>({
      terminalStages: ['idle', 'completed'],
      completedStages: ['completed']
    })
    estimator.update({ stage: 'indexing', current: 0, total: 100, now: 1_000 })
    estimator.update({ stage: 'indexing', current: 20, total: 100, now: 2_000 })

    expect(estimator.update({ stage: 'idle', current: 0, total: 0, now: 3_000 })).toEqual({
      estimatedRemainingMs: null,
      averageItemsPerSecond: 0,
      status: 'unknown',
      speedSampleCount: 0,
      estimateBasis: 'none'
    })
  })

  it('does not keep reporting stale ETA when progress stalls', () => {
    const estimator = new IndexingProgressEstimatorService<TestProgressStage>({
      maxNoProgressMs: 2_000
    })
    estimator.update({ stage: 'indexing', current: 0, total: 100, now: 1_000 })
    estimator.update({ stage: 'indexing', current: 10, total: 100, now: 2_000 })
    estimator.update({ stage: 'indexing', current: 20, total: 100, now: 3_000 })

    const estimate = estimator.update({ stage: 'indexing', current: 20, total: 100, now: 5_000 })

    expect(estimate.estimatedRemainingMs).toBeNull()
    expect(estimate.averageItemsPerSecond).toBe(0)
    expect(estimate.status).toBe('stalled')
    expect(estimate.estimateBasis).toBe('stalled')
  })

  it('uses elapsed progress as a conservative fallback before enough speed samples exist', () => {
    const estimator = new IndexingProgressEstimatorService<TestProgressStage>({
      minElapsedMsForFallbackEta: 2_000,
      fallbackEtaSafetyMultiplier: 1.5
    })
    estimator.update({ stage: 'indexing', current: 0, total: 100, now: 1_000 })

    const estimate = estimator.update({ stage: 'indexing', current: 10, total: 100, now: 3_000 })

    expect(estimate.status).toBe('estimated')
    expect(estimate.estimateBasis).toBe('elapsed-progress')
    expect(estimate.speedSampleCount).toBe(1)
    expect(estimate.averageItemsPerSecond).toBe(5)
    expect(estimate.estimatedRemainingMs).toBe(27_000)
  })

  it('normalizes malformed samples without producing fake ETA', () => {
    const estimator = new IndexingProgressEstimatorService<TestProgressStage>({
      minElapsedMsForFallbackEta: 1_000
    })

    const first = estimator.update({
      stage: 'indexing',
      current: Number.NaN,
      total: Number.NEGATIVE_INFINITY,
      now: Number.NaN
    })

    expect(first).toEqual({
      estimatedRemainingMs: null,
      averageItemsPerSecond: 0,
      status: 'unknown',
      speedSampleCount: 0,
      estimateBasis: 'none'
    })

    const rollback = estimator.update({
      stage: 'indexing',
      current: 10,
      total: 100,
      now: -1
    })

    expect(rollback).toMatchObject({
      estimatedRemainingMs: null,
      averageItemsPerSecond: 0,
      status: 'stabilizing',
      speedSampleCount: 0,
      estimateBasis: 'none'
    })
  })

  it('falls back for malformed estimator options', () => {
    const estimator = new IndexingProgressEstimatorService<TestProgressStage>({
      minSampleIntervalMs: Number.NaN,
      minProgressRatioForEta: Number.POSITIVE_INFINITY,
      minSpeedSamplesForEta: Number.NEGATIVE_INFINITY,
      maxNoProgressMs: -1,
      smoothingFactor: Number.NaN,
      maxEtaMs: Number.NaN,
      minElapsedMsForFallbackEta: Number.NEGATIVE_INFINITY,
      fallbackEtaSafetyMultiplier: Number.NaN
    })

    estimator.update({ stage: 'indexing', current: 0, total: 100, now: 1_000 })
    estimator.update({ stage: 'indexing', current: 10, total: 100, now: 2_000 })
    const estimate = estimator.update({ stage: 'indexing', current: 20, total: 100, now: 3_000 })

    expect(estimate).toMatchObject({
      status: 'estimated',
      speedSampleCount: 2,
      estimateBasis: 'stage-speed'
    })
    expect(estimate.averageItemsPerSecond).toBeGreaterThan(0)
    expect(estimate.estimatedRemainingMs).toBeGreaterThan(0)
  })

  it('prefers stage speed after enough samples are available', () => {
    const estimator = new IndexingProgressEstimatorService<TestProgressStage>({
      minElapsedMsForFallbackEta: 1_000
    })
    estimator.update({ stage: 'indexing', current: 0, total: 100, now: 1_000 })
    estimator.update({ stage: 'indexing', current: 10, total: 100, now: 2_000 })

    const estimate = estimator.update({ stage: 'indexing', current: 20, total: 100, now: 3_000 })

    expect(estimate.status).toBe('estimated')
    expect(estimate.estimateBasis).toBe('stage-speed')
    expect(estimate.speedSampleCount).toBe(2)
  })

  it('returns zero remaining time when a non-terminal stage reaches total', () => {
    const estimator = new IndexingProgressEstimatorService<TestProgressStage>({
      minElapsedMsForFallbackEta: 1_000
    })
    estimator.update({ stage: 'indexing', current: 0, total: 10, now: 1_000 })

    const estimate = estimator.update({ stage: 'indexing', current: 10, total: 10, now: 2_000 })

    expect(estimate.status).toBe('estimated')
    expect(estimate.estimatedRemainingMs).toBe(0)
    expect(estimate.estimateBasis).toBe('stage-speed')
  })

  it('returns the latest estimate without mutating samples', () => {
    const estimator = new IndexingProgressEstimatorService<TestProgressStage>()
    estimator.update({ stage: 'indexing', current: 0, total: 100, now: 1_000 })
    const estimate = estimator.update({ stage: 'indexing', current: 10, total: 100, now: 2_000 })

    expect(estimator.getEstimate()).toEqual(estimate)
    expect(estimator.getEstimate()).toEqual(estimate)
  })
})
