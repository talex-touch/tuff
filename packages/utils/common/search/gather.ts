import { TuffUpdate } from "."

/**
 * @interface ITuffGatherOptions
 * @description Configuration options for the search result aggregator.
 */
export interface ITuffGatherOptions {
  /**
   * The number of providers to run in parallel.
   * @default 3
   */
  concurrency?: number
  /**
   * The time to wait for more results before flushing the buffer.
   * @default 100
   */
  coalesceGapMs?: number
  /**
   * A shorter grace period for the first batch to ensure a quick initial response.
   * @default 50
   */
  firstBatchGraceMs?: number
  /**
   * A small debounce delay for the push function to avoid rapid-fire updates.
   * @default 10
   */
  debouncePushMs?: number
  /**
   * The maximum time to wait for a single provider to return results.
   * @default 5000
   */
  taskTimeoutMs?: number
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
