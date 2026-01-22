import type {
  ISearchProvider,
  ISortMiddleware,
  SortStat,
  TuffItem,
  TuffQuery,
  TuffSearchResult
} from '@talex-touch/utils'
import type { TalexEvents } from '../../../core/eventbus/touch-event'
import type { TouchApp } from '../../../core/touch-app'
/**
 * Tuff Search Engine Type Definitions
 * Aligned with the TUFF DSL (Typed Unified Flex Format)
 *
 * @module core-app/main/modules/box-tool/search-engine/types
 */
import type { TalexTouch } from '../../../types'
import type { DatabaseModule } from '../../database'
import type { SearchIndexService } from './search-index-service'

export interface ProviderContext {
  touchApp: TouchApp
  databaseManager: DatabaseModule
  storageManager: TalexTouch.IModule<TalexEvents>
  searchIndex: SearchIndexService
}

// Re-export types for convenience
export type { ISearchProvider, ISortMiddleware, SortStat, TuffItem, TuffQuery, TuffSearchResult }
