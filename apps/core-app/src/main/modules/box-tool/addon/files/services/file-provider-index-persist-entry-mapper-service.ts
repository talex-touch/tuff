import type { IndexWorkerFileResult } from '../workers/file-index-worker-client'
import type { PersistEntry } from '../../../search-engine/workers/search-index-worker-client'
import { IndexedWorkerPersistEntryMapperService } from '@talex-touch/utils/search'
import type { SearchIndexItem } from '../../../search-engine/search-index-service'

export class FileProviderIndexPersistEntryMapperService {
  private readonly mapper = new IndexedWorkerPersistEntryMapperService<SearchIndexItem>()

  map(entries: IndexWorkerFileResult[]): PersistEntry[] {
    return this.mapper.map(entries)
  }
}
