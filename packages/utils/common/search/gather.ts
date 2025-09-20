import { TuffUpdate } from "."

/**
 * Defines the detailed configuration options for the aggregator.
 */
export interface ITuffGatherOptions {
  /**
   * Timeout configuration in milliseconds.
   */
  timeout: {
    /**
     * Timeout for the default queue.
     * Search speed is critical for user experience, so the default search
     * should not take too long to return results.
     * @default 50
     */
    default: number

    /**
     * Timeout for the fallback queue.
     * The fallback queue should have a longer timeout as its sources
     * are often network requests or slower local I/O.
     * @default 3000
     */
    fallback: number
  }

  /**
   * Concurrency configuration.
   */
  concurrent: {
    /**
     * Number of concurrent search sources for the default queue.
     * @default 5
     */
    default: number

    /**
     * Number of concurrent search sources for the fallback queue.
     * @default 10
     */
    fallback: number
  }

  /**
   * Delay in milliseconds for a forced push of results.
   * When the aggregator receives the first search result, it opens a "push window"
   * of this duration. Results arriving within this window are buffered and pushed
   * all at once when the window closes, ensuring stable batch updates and preventing UI flickering.
   * If all search tasks complete before this time, results are pushed immediately.
   * @default 50
   */
  forcePushDelay: number
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
