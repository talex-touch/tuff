import type { IndexWorkerFileResult } from '../workers/file-index-worker-client'
import type { FilePersistenceEntry } from '../../../search-engine/search-index-writer'
import { IndexedWorkerPersistEntryMapperService } from '@talex-touch/utils/search'

export class FileProviderIndexPersistEntryMapperService {
  private readonly mapper = new IndexedWorkerPersistEntryMapperService()

  map(entries: IndexWorkerFileResult[]): FilePersistenceEntry[] {
    return this.mapper.map(entries)
  }
}
