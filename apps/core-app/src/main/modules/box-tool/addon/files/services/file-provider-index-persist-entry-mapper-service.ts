import type { IndexWorkerFileResult } from '../workers/file-index-worker-client'
import type { PersistEntry } from '../../../search-engine/workers/search-index-worker-client'
import { IndexedWorkerPersistEntryMapperService } from '../../../search-engine/indexing-worker-persist-entry-mapper-service'

export class FileProviderIndexPersistEntryMapperService {
  private readonly mapper = new IndexedWorkerPersistEntryMapperService<IndexWorkerFileResult>()

  map(entries: IndexWorkerFileResult[]): PersistEntry[] {
    return this.mapper.map(entries)
  }
}
