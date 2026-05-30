import type { SearchIndexItem } from './search-index-service'

export { IndexedWorkerPersistEntryMapperService } from '@talex-touch/utils/search'

export type {
  IndexedWorkerEmbeddingLike,
  IndexedWorkerFileUpdateLike,
  IndexedWorkerPersistEntryLike,
  IndexedWorkerProgressLike
} from '@talex-touch/utils/search'

export type IndexedWorkerPersistRecordLike =
  import('@talex-touch/utils/search').IndexedWorkerPersistRecordLike<SearchIndexItem>
