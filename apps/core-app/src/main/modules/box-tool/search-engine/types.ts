/**
 * Tuff Search Engine Type Definitions
 * Aligned with the TUFF DSL (Typed Unified Flex Format)
 *
 * @module core-app/main/modules/box-tool/search-engine/types
 */

import type {
  TuffItem as TuffItemBase,
  TuffQuery,
  TuffSearchResult as TuffSearchResultBase,
  TuffSourceType
} from '@talex-touch/utils/core-box'
import { TouchApp } from '../../../core/touch-core'
import { DatabaseManager } from '../../database'
import { TalexTouch } from '../../../types'

export interface ProviderContext {
  touchApp: TouchApp
  databaseManager: DatabaseManager
  storageManager: TalexTouch.IModule
}

export interface TuffItem extends TuffItemBase {
  from?: string
}

export type { TuffQuery }

/**
 * Represents the statistics for a single sort middleware.
 */
export interface SortStat {
  /** The name of the sorting middleware. */
  name: string
  /** The time taken by the middleware in milliseconds. */
  duration: number
}

/**
 * Extends the base TUFF search result to include sorting statistics.
 */
export interface TuffSearchResult extends TuffSearchResultBase {
  /** Optional statistics about the sorting process. */
  sort_stats?: SortStat[]
  /** Unique identifier for the search session. */
  sessionId?: string
}

/**
 * Defines the interface for a sort middleware.
 * Each middleware receives an array of items and should return a sorted array.
 */
export interface ISortMiddleware {
  /** A unique name for the middleware, used for logging and stats. */
  readonly name: string
  /**
   * The sort function that processes the items.
   * @param items - The array of TuffItems to be sorted.
   * @param query - The original search query for context.
   * @param signal - An AbortSignal to cancel the sorting operation.
   * @returns A sorted array of TuffItems.
   */
  sort(items: TuffItem[], query: TuffQuery, signal: AbortSignal): TuffItem[]
}

/**
 * Search Provider Interface (formerly ISearchSource)
 *
 * Defines the contract for any module that provides search results to the engine.
 * It's a simplified, stateless interface focused solely on providing results for a given query.
 */
export interface IExecuteArgs {
  item: TuffItem
  searchResult: TuffSearchResult
}

export interface ISearchProvider {
  /**
   * Unique identifier for the provider, e.g., "mac-applications", "file-system", "clipboard-history"
   * @required
   */
  readonly id: string

  /**
   * The type of the source, used for categorization and filtering.
   * @required
   */
  readonly type: TuffSourceType

  /**
   * User-friendly name for the provider, displayed in settings or logs.
   */
  readonly name?: string

  /**
   * Core search method (PULL mode).
   * The engine calls this method to get results from the provider.
   *
   * @param query - The search query object, containing text and other context.
   * @param signal - An AbortSignal to cancel the search operation.
   * @returns A promise that resolves to an array of TuffItems.
   */
  onSearch(query: TuffQuery, signal: AbortSignal): Promise<TuffItem[]>

  /**
   * Optional method to handle activation.
   * Called when the provider is prioritized, e.g., via an activation keyword.
   */
  onActivate?(): void

  /**
   * Optional method to handle deactivation.
   */
  onDeactivate?(): void

  /**
   * Optional method to execute an item.
   * @param args The arguments for execution, including the item and search context.
   */
  onExecute?(args: IExecuteArgs): any

  /**
   * Optional method to load provider.
   * @param context The context of the provider.
   */
  onLoad?(context: ProviderContext): Promise<void>
}

/**
 * Search Engine Interface (formerly ISearchEngine)
 *
 * Defines the core functionality of the search aggregator and orchestrator.
 */
export interface ISearchEngine {
  /**
   * Registers a search provider with the engine.
   * @param provider - An instance of ISearchProvider.
   */
  registerProvider(provider: ISearchProvider): void

  /**
   * Unregisters a search provider by its unique ID.
   * @param providerId - The unique ID of the provider to remove.
   */
  unregisterProvider(providerId: string): void

  /**
   * Executes a search across all registered and relevant providers.
   * It aggregates, scores, and ranks the results.
   *
   * @param query - The search query object.
   * @returns A promise that resolves to a TuffSearchResult object,
   *          containing the ranked items and metadata about the search operation.
   */
  search(query: TuffQuery): Promise<TuffSearchResult>

  /**
   * Performs background maintenance tasks, such as pre-heating caches,
   * refreshing indexes, etc.
   */
  maintain(): void
}

/**
 * Represents a single update pushed from the search-gatherer.
 * It provides a snapshot of the search progress at a point in time.
 */
export interface TuffUpdate {
  /**
   * New search result items from the current push batch.
   */
  newItems: TuffItem[]
  /**
   * Total number of results aggregated so far.
   */
  totalCount: number
  /**
   * Flag indicating whether all search tasks (both default and fallback queues) have completed.
   */
  isDone: boolean
  /**
   * Statistics about the performance of each search provider.
   */
  sourceStats?: TuffSearchResult['sources']
}

// This empty export statement forces the file to be treated as a module.
export {}
