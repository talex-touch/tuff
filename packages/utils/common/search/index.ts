import { ISearchProvider, TuffQuery, TuffSearchResult } from '@talex-touch/utils'

export * from './gather'

/**
 * Represents a single update pushed from the search-gatherer.
 * It provides a snapshot of the search progress at a point in time.
 */
export interface TuffUpdate {
  /**
   * New search results from the current push batch.
   * Each element is a complete TuffSearchResult from a provider.
   */
  newResults: TuffSearchResult[]
  /**
   * Total number of items aggregated so far.
   */
  totalCount: number
  /**
   * Flag indicating whether all search tasks (both default and fallback queues) have completed.
   */
  isDone: boolean
  /**
   * Flag indicating whether the search was cancelled.
   */
  cancelled?: boolean
  /**
   * Statistics about the performance of each search provider.
   */
  sourceStats?: TuffSearchResult['sources']
}


/**
 * Search Engine Interface (formerly ISearchEngine)
 *
 * Defines the core functionality of the search aggregator and orchestrator.
 */
export interface ISearchEngine<C> {
  /**
   * Registers a search provider with the engine.
   * @param provider - An instance of ISearchProvider.
   */
  registerProvider(provider: ISearchProvider<C>): void

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
