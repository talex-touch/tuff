import type { FileIndexStage } from '@talex-touch/utils/transport/events/types'
import type { IndexingProgressEstimate } from '../../../search-engine/indexing-progress-estimator-service'
import { IndexingProgressEstimatorService } from '../../../search-engine/indexing-progress-estimator-service'

export type FileProviderProgressEstimate = IndexingProgressEstimate

export class FileProviderProgressEstimatorService extends IndexingProgressEstimatorService<FileIndexStage> {
  constructor() {
    super({
      terminalStages: ['idle', 'completed'],
      completedStages: ['completed']
    })
  }
}
