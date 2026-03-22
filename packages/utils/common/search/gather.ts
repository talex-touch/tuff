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
   * The maximum time to wait for a single provider to return results.
   * @default 3000
   */
  taskTimeoutMs?: number

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
