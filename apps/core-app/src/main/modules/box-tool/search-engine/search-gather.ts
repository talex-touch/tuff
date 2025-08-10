import { TuffItem, TuffQuery, withTimeout, TimeoutError } from '@talex-touch/utils'
import { ISearchProvider, TuffUpdate } from './types'

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
     * @default 200
     */
    default: number

    /**
     * Timeout for the fallback queue.
     * The fallback queue should have a longer timeout as its sources
     * are often network requests or slower local I/O.
     * @default 5000
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
   * @default 217
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

/**
 * Default configuration options for the aggregator.
 */
const defaultTuffGatherOptions: ITuffGatherOptions = {
  timeout: {
    default: 200,
    fallback: 5000
  },
  concurrent: {
    default: 5,
    fallback: 2
  },
  forcePushDelay: 217
}

/**
 * The core aggregator for the Tuff launcher.
 * It concurrently calls multiple search providers, handles timeouts and fallbacks,
 * and returns results in a stable, real-time manner through an intelligent batching mechanism.
 * It resolves with the total count after all tasks are completed.
 *
 * @param providers - A list of all search providers to participate in the current search.
 * @param params - The current search query parameters.
 * @param onUpdate - The callback function to receive real-time search result updates.
 * @param options - Detailed configuration options for the aggregator.
 * @returns A promise that resolves with the total number of aggregated results when all search tasks are finished.
 */
export function getGatheredItems(
  providers: ISearchProvider[],
  params: TuffQuery,
  onUpdate: TuffAggregatorCallback,
  options: ITuffGatherOptions = defaultTuffGatherOptions
): IGatherController {
  console.debug(`[Gather] Starting search with ${providers.length} providers.`)
  const controller = new AbortController()
  const { signal } = controller

  const promise = new Promise<number>((resolve) => {
    const { timeout, concurrent, forcePushDelay } = options

    const allResults: TuffItem[] = []
    const sourceStats: TuffUpdate['sourceStats'] = []
    const fallbackQueue: ISearchProvider[] = []
    const defaultQueue = [...providers]

    let pushBuffer: TuffItem[] = []
    let forcePushTimerId: NodeJS.Timeout | null = null

    /**
     * Core push logic. Flushes the buffer and pushes results to the caller via the onUpdate callback.
     * @param isFinalFlush - Whether this is the last push. If true, an additional `isDone: true` signal is sent.
     */
    const flushBuffer = (isFinalFlush = false): void => {
      if (forcePushTimerId) {
        clearTimeout(forcePushTimerId)
        forcePushTimerId = null
      }

      if (pushBuffer.length > 0) {
        onUpdate({
          newItems: pushBuffer,
          totalCount: allResults.length,
          isDone: false, // isDone is always false for intermediate pushes
          sourceStats
        })
        pushBuffer = [] // Clear buffer after pushing
      }

      if (isFinalFlush) {
        onUpdate({
          newItems: [], // The last push might not have new items but needs to update isDone
          totalCount: allResults.length,
          isDone: true,
          sourceStats
        })
        resolve(allResults.length) // Resolve the main promise with the total count
      }
    }

    /**
     * Handles new results from any provider.
     * @param result - The newly arrived array of results.
     */
    const onNewResultArrived = (result: TuffItem[], providerId: string): void => {
      console.log(`[Gather] Received ${result.length} items from provider: ${providerId}`)
      allResults.push(...result)
      pushBuffer.push(...result)

      // If this is the first batch of results and the push timer hasn't started, start it.
      if (!forcePushTimerId && allResults.length === result.length && result.length > 0) {
        forcePushTimerId = setTimeout(() => {
          flushBuffer() // Force push all content in the buffer when the timer fires
        }, forcePushDelay)
      }
    }

    /**
     * Executes the concurrent worker pool.
     * @param queue - The queue of providers to process.
     * @param concurrency - The number of concurrent workers.
     * @param processingTimeout - The timeout for a single task.
     * @param isFallback - Flag indicating if the current queue is the fallback queue.
     */
    const runWorkerPool = async (
      queue: ISearchProvider[],
      concurrency: number,
      processingTimeout: number,
      isFallback = false
    ): Promise<void> => {
      const queueName = isFallback ? 'Fallback' : 'Default'
      console.debug(`[Gather] Running ${queueName} queue with ${concurrency} concurrent workers.`)
      const workers = Array(concurrency)
        .fill(0)
        .map(async () => {
          while (queue.length > 0) {
            const provider = queue.shift()
            if (!provider) continue

            const startTime = performance.now()
            let resultCount = 0
            let status: 'success' | 'timeout' | 'error' = 'success'

            try {
              if (signal.aborted) {
                status = 'error'
                // Skip processing if the search has been aborted
                return
              }
              const searchResult = await withTimeout(
                provider.onSearch(params, signal),
                processingTimeout
              )
              resultCount = searchResult.length

              if (searchResult.length > 0) {
                const processedResult = isFallback
                  ? searchResult.map((item) => ({
                      ...item,
                      meta: {
                        ...item.meta,
                        extension: {
                          ...item.meta?.extension,
                          isFallback: true
                        }
                      }
                    }))
                  : searchResult

                onNewResultArrived(processedResult, provider.id)
              }
            } catch (error) {
              if (signal.aborted) {
                status = 'error'
                return
              }
              if (error instanceof TimeoutError) {
                status = 'timeout'
                if (!isFallback) {
                  // Default queue timed out, move provider to fallback queue
                  fallbackQueue.push(provider)
                }
              } else {
                status = 'error'
                console.error(
                  `Provider [${provider.constructor.name}] encountered an error during search:`,
                  error
                )
              }
            } finally {
              const duration = performance.now() - startTime
              sourceStats.push({
                providerId: provider.id,
                providerName: provider.name || provider.constructor.name,
                duration,
                resultCount,
                status
              })
            }
          }
        })
      await Promise.all(workers)
    }

    const run = async (): Promise<void> => {
      // --- Aggregator Execution Flow ---
      // Phase 1: Process the default queue concurrently
      await runWorkerPool(defaultQueue, concurrent.default, timeout.default)

      // Phase 2: If there are demoted providers, process the fallback queue
      if (fallbackQueue.length > 0) {
        await runWorkerPool(fallbackQueue, concurrent.fallback, timeout.fallback, true)
      }

      // All tasks (default and fallback) are done. Perform a final flush.
      // This ensures that results are pushed immediately even if tasks finish within the forcePushDelay.
      console.debug('[Gather] All search tasks completed.')
      flushBuffer(true)
    }

    run()
  })

  return {
    promise,
    abort: () => {
      if (!controller.signal.aborted) {
        console.log('[Gather] Aborting search.')
        controller.abort()
      }
    },
    signal
  }
}
