/**
 * Tuff Search Engine Type Definitions
 * Aligned with the TUFF DSL (Typed Unified Flex Format)
 *
 * @module core-app/main/modules/box-tool/search-engine/types
 */
import { TalexTouch } from '../../../types'
import { TalexEvents } from '../../../core/eventbus/touch-event'
import { TouchApp } from '../../../core/touch-app'
import { DatabaseModule } from '../../database'
import type { SearchIndexService } from './search-index-service'
import type {
  TuffQuery,
  TuffSearchResult,
  TuffItem,
  ISearchProvider,
  ISortMiddleware,
  SortStat
} from '@talex-touch/utils'

export interface ProviderContext {
  touchApp: TouchApp
  databaseManager: DatabaseModule
  storageManager: TalexTouch.IModule<TalexEvents>
  searchIndex: SearchIndexService
}

// Re-export types for convenience
export type { TuffQuery, TuffSearchResult, TuffItem, ISearchProvider, ISortMiddleware, SortStat }
