import type { TuffUpdate } from '.'

/**
 * Search priority layer type
 */
export type SearchPriorityLayer = 'fast' | 'deferred'

/**
 * @interface ITuffGatherOptions
 * @description Configuration options for the search result aggregator.
 */
export interface ITuffGatherOptions {
  /**
   * The number of providers to run in parallel (legacy, used when layered mode is disabled).
   * @default 4
   */
  concurrency?: number
  /**
   * The time to wait for more results before flushing the buffer.
   * @default 50
   */
  coalesceGapMs?: number
  /**
   * A shorter grace period for the first batch to ensure a quick initial response.
   * @default 20
   */
  firstBatchGraceMs?: number
  /**
   * A small debounce delay for the push function to avoid rapid-fire updates.
   * @default 8
   */
  debouncePushMs?: number
  /**
   * The maximum time to wait for a single provider to return results.
   * @default 3000
   */
  taskTimeoutMs?: number

  // ==================== Layered Search Options ====================

  /**
   * Enable layered search mode (fast layer + deferred layer).
   * When enabled, providers with priority='fast' run first with a timeout,
   * then deferred providers run asynchronously.
   * @default true
   */
  enableLayeredSearch?: boolean

  /**
   * Maximum wait time for all fast layer providers.
   * After this timeout, fast layer results are returned immediately,
   * even if some fast providers haven't completed.
   * @default 80
   */
  fastLayerTimeoutMs?: number

  /**
   * Delay before starting deferred layer execution.
   * Allows UI to render fast layer results first, avoiding CPU contention.
   * @default 50
   */
  deferredLayerDelayMs?: number

  /**
   * Concurrency limit for fast layer providers.
   * @default 3
   */
  fastLayerConcurrency?: number

  /**
   * Concurrency limit for deferred layer providers.
   * @default 2
   */
  deferredLayerConcurrency?: number
}

/**
 * Defines the type signature for the real-time update callback function.
 * @param update - The data object containing update information.
 */
export type TuffAggregatorCallback = (update: TuffUpdate) => void

export interface IGatherController {
  abort: () => void
  promise: Promise<number>
  signal: AbortSignal
}
