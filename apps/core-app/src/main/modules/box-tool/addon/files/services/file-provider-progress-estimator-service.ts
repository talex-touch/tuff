import type { FileIndexStage } from '@talex-touch/utils/transport/events/types'
import type { IndexingProgressEstimate } from '@talex-touch/utils/search'
import { IndexingProgressEstimatorService } from '@talex-touch/utils/search'

export type FileProviderProgressEstimate = IndexingProgressEstimate

export class FileProviderProgressEstimatorService extends IndexingProgressEstimatorService<FileIndexStage> {
  constructor() {
    super({
      terminalStages: ['idle', 'completed'],
      completedStages: ['completed']
    })
  }
}
