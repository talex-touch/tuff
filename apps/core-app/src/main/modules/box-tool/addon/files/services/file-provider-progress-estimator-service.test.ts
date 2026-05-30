import { describe, expect, it } from 'vitest'
import { FileProviderProgressEstimatorService } from './file-provider-progress-estimator-service'

describe('file-provider-progress-estimator-service', () => {
  it('adapts the shared indexing progress estimator to FileIndexStage terminal states', () => {
    const estimator = new FileProviderProgressEstimatorService()
    estimator.update({ stage: 'indexing', current: 0, total: 100, now: 1_000 })
    estimator.update({ stage: 'indexing', current: 10, total: 100, now: 2_000 })

    expect(estimator.update({ stage: 'completed', current: 1, total: 1, now: 3_000 })).toEqual({
      estimatedRemainingMs: 0,
      averageItemsPerSecond: 0,
      status: 'complete',
      speedSampleCount: 0,
      estimateBasis: 'complete'
    })

    expect(estimator.update({ stage: 'idle', current: 0, total: 0, now: 4_000 })).toEqual({
      estimatedRemainingMs: null,
      averageItemsPerSecond: 0,
      status: 'unknown',
      speedSampleCount: 0,
      estimateBasis: 'none'
    })
  })
})
