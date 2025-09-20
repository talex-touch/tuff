import {
  TuffQuery,
  withTimeout,
  TimeoutError,
  TuffSearchResult,
  ITuffGatherOptions,
  ISearchProvider,
  TuffAggregatorCallback,
  IGatherController,
  TuffUpdate
} from '@talex-touch/utils'
import { ProviderContext } from './types'

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
  forcePushDelay: 50
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
  providers: ISearchProvider<ProviderContext>[],
  params: TuffQuery,
  onUpdate: TuffAggregatorCallback,
  options: ITuffGatherOptions = defaultTuffGatherOptions
): IGatherController {
  console.debug(`[Gather] Starting search with ${providers.length} providers.`)
  const controller = new AbortController()
  const { signal } = controller

  const promise = new Promise<number>((resolve) => {
    const { timeout, concurrent, forcePushDelay } = options

    const allResults: TuffSearchResult[] = []
    const sourceStats: TuffUpdate['sourceStats'] = []
    const fallbackQueue: ISearchProvider<ProviderContext>[] = []
    const defaultQueue = [...providers]

    let pushBuffer: TuffSearchResult[] = []
    let forcePushTimerId: NodeJS.Timeout | null = null
    let hasFlushedFirstBatch = false

    /**
     * Core push logic. Flushes the buffer and pushes results to the caller via the onUpdate callback.
     * @param isFinalFlush - Whether this is the last push. If true, an additional `isDone: true` signal is sent.
     */
    const flushBuffer = (isFinalFlush = false, forcePush = false): void => {
      if (forcePushTimerId) {
        clearTimeout(forcePushTimerId)
        forcePushTimerId = null
      }

      // For the first batch, we must push even if the buffer is empty to signal the end of the phase.
      if (pushBuffer.length > 0 || forcePush) {
        const itemsCount = allResults.reduce((acc, curr) => acc + curr.items.length, 0)
        onUpdate({
          newResults: pushBuffer,
          totalCount: itemsCount,
          isDone: false,
          sourceStats
        })
        pushBuffer = [] // Clear buffer after pushing
      }

      if (isFinalFlush) {
        const itemsCount = allResults.reduce((acc, curr) => acc + curr.items.length, 0)
        onUpdate({
          newResults: [],
          totalCount: itemsCount,
          isDone: true,
          sourceStats
        })
        resolve(itemsCount) // Resolve the main promise with the total count
      }
    }

    /**
     * Handles new results from any provider.
     * @param result - The newly arrived TuffSearchResult.
     * @param providerId - The ID of the provider that returned the results.
     */
    let firstBatchTimeoutId: NodeJS.Timeout | null = null

    const flushFirstBatchOnce = (): void => {
      if (hasFlushedFirstBatch) {
        return
      }
      hasFlushedFirstBatch = true
      if (firstBatchTimeoutId) {
        clearTimeout(firstBatchTimeoutId)
        firstBatchTimeoutId = null
      }
      console.debug('[Gather] Flushing first batch.')
      // The first flush is forced to ensure the core receives a signal.
      flushBuffer(false, true)
    }

    /**
     * Handles new results from any provider.
     * @param result - The newly arrived TuffSearchResult.
     * @param providerId - The ID of the provider that returned the results.
     */
    const onNewResultArrived = (result: TuffSearchResult, providerId: string): void => {
      console.debug(`[Gather] Received ${result.items.length} items from provider: ${providerId}`)
      allResults.push(result)
      pushBuffer.push(result)

      // After the first batch is flushed, use a debouncing mechanism for subsequent updates.
      if (hasFlushedFirstBatch) {
        if (forcePushTimerId) {
          clearTimeout(forcePushTimerId)
        }
        forcePushTimerId = setTimeout(() => {
          flushBuffer()
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
      queue: ISearchProvider<ProviderContext>[],
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
              resultCount = searchResult.items.length

              // Always process the result, even if items are empty, because it might contain activation info.
              const processedResult = searchResult
              if (isFallback) {
                processedResult.items = processedResult.items.map((item) => ({
                  ...item,
                  meta: {
                    ...item.meta,
                    extension: {
                      ...item.meta?.extension,
                      isFallback: true
                    }
                  }
                }))
              }
              onNewResultArrived(processedResult, provider.id)
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
      // Phase 1: Process the default queue.
      // We set a 200ms timer from the start. All results arriving within this window
      // will be batched and flushed together.
      firstBatchTimeoutId = setTimeout(flushFirstBatchOnce, 200)

      // Await the completion of the entire default queue.
      await runWorkerPool(defaultQueue, concurrent.default, timeout.default)

      // Ensure the first batch flush is called, even if the default queue was empty or yielded no results.
      // This is crucial for signaling the end of the high-priority phase.
      flushFirstBatchOnce()

      // Phase 2: If there are demoted providers, process the fallback queue
      if (fallbackQueue.length > 0) {
        console.debug(`[Gather] Starting fallback queue with ${fallbackQueue.length} providers.`)
        await runWorkerPool(fallbackQueue, concurrent.fallback, timeout.fallback, true)
      }

      // All tasks (default and fallback) are done. Perform a final flush.
      console.debug('[Gather] All search tasks completed.')
      flushBuffer(true)
    }

    run()
  })

  return {
    promise,
    abort: () => {
      if (!controller.signal.aborted) {
        console.debug('[Gather] Aborting search.')
        controller.abort()
      }
    },
    signal
  }
}
