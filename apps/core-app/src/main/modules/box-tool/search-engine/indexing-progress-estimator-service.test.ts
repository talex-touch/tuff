import { describe, expect, it } from 'vitest'
import { IndexingProgressEstimatorService as SdkIndexingProgressEstimatorService } from '@talex-touch/utils/search'
import { IndexingProgressEstimatorService } from './indexing-progress-estimator-service'

describe('indexing-progress-estimator-service', () => {
  it('re-exports the public SDK estimator for legacy CoreApp imports', () => {
    expect(IndexingProgressEstimatorService).toBe(SdkIndexingProgressEstimatorService)
  })
})
