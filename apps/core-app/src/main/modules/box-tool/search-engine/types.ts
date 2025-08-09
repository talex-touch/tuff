/**
 * Tuff Search Engine Type Definitions
 * Aligned with the TUFF DSL (Typed Unified Flex Format)
 *
 * @module core-app/main/modules/box-tool/search-engine/types
 */

import type { TuffItem, TuffQuery, TuffSearchResult, TuffSourceType } from '@talex-touch/utils/core-box';

export type { TuffItem, TuffQuery, TuffSearchResult };

/**
 * Search Provider Interface (formerly ISearchSource)
 *
 * Defines the contract for any module that provides search results to the engine.
 * It's a simplified, stateless interface focused solely on providing results for a given query.
 */
export interface ISearchProvider {
  /**
   * Unique identifier for the provider, e.g., "mac-applications", "file-system", "clipboard-history"
   * @required
   */
  readonly id: string;

  /**
   * The type of the source, used for categorization and filtering.
   * @required
   */
  readonly type: TuffSourceType;

  /**
   * User-friendly name for the provider, displayed in settings or logs.
   */
  readonly name?: string;

  /**
   * Core search method (PULL mode).
   * The engine calls this method to get results from the provider.
   *
   * @param query - The search query object, containing text and other context.
   * @returns A promise that resolves to an array of TuffItems.
   */
  onSearch(query: TuffQuery): Promise<TuffItem[]>;

  /**
   * Optional method to handle activation.
   * Called when the provider is prioritized, e.g., via an activation keyword.
   */
  onActivate?(): void;

  /**
   * Optional method to handle deactivation.
   */
  onDeactivate?(): void;
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
  registerProvider(provider: ISearchProvider): void;

  /**
   * Unregisters a search provider by its unique ID.
   * @param providerId - The unique ID of the provider to remove.
   */
  unregisterProvider(providerId: string): void;

  /**
   * Executes a search across all registered and relevant providers.
   * It aggregates, scores, and ranks the results.
   *
   * @param query - The search query object.
   * @returns A promise that resolves to a TuffSearchResult object,
   *          containing the ranked items and metadata about the search operation.
   */
  search(query: TuffQuery): Promise<TuffSearchResult>;

  /**
   * Performs background maintenance tasks, such as pre-heating caches,
   * refreshing indexes, etc.
   */
  maintain(): void;
}

// This empty export statement forces the file to be treated as a module.
export {};
