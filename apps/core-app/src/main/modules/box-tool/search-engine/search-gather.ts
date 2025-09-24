import {
  TuffQuery,
  withTimeout,
  TuffSearchResult,
  ITuffGatherOptions,
  ISearchProvider,
  TuffAggregatorCallback,
  IGatherController
} from '@talex-touch/utils'
import { ProviderContext } from './types'
import { performance } from 'perf_hooks'
import chalk from 'chalk'

import { debounce } from 'lodash'

/**
 * @interface ExtendedSourceStat
 * @description Extends the source statistics interface to include timing and status.
 */
interface ExtendedSourceStat {
  providerId: string
  providerName: string
  duration: number
  resultCount: number
  status: 'success' | 'timeout' | 'error'
}

/**
 * @constant defaultTuffGatherOptions
 * @description Default configuration for the aggregator.
 */
const defaultTuffGatherOptions: Required<ITuffGatherOptions> = {
  concurrency: 3,
  coalesceGapMs: 100,
  firstBatchGraceMs: 50,
  debouncePushMs: 10,
  taskTimeoutMs: 5000
}

/**
 * Creates a search controller that manages the lifecycle of a search operation.
 * @param callback - The function that executes the search logic.
 * @returns An `IGatherController` to manage the search.
 */
function createGatherController(
  callback: (
    signal: AbortSignal,
    resolve: (value: number | PromiseLike<number>) => void
  ) => Promise<number>
): IGatherController {
  const controller = new AbortController()
  const { signal } = controller

  const promise = new Promise<number>((resolve, reject) => {
    callback(signal, resolve).catch(reject)
  })

  return {
    promise,
    abort: () => {
      if (!controller.signal.aborted) {
        console.debug('Aborting search.')
        controller.abort()
      }
    },
    signal
  }
}

/**
 * Creates the core search aggregator with a single-queue, concurrent worker pool, and smart batching.
 * This implementation optimizes for speed and responsiveness by:
 * - Using a fixed-concurrency worker pool to process all providers.
 * - Intelligently batching results to reduce UI flicker and unnecessary re-renders.
 * - Providing a grace period for the first batch to ensure a fast initial response.
 *
 * @param options - Detailed configuration for the aggregator.
 * @returns A function that executes a search with the given providers and query.
 */
export function createGatherAggregator(options: ITuffGatherOptions = {}) {
  const config = { ...defaultTuffGatherOptions, ...options }
  const { concurrency, coalesceGapMs, firstBatchGraceMs, debouncePushMs, taskTimeoutMs } = config

  /**
   * The main search execution function.
   * @param providers - The list of search providers.
   * @param params - The search query and parameters.
   * @param onUpdate - The callback to receive real-time search updates.
   * @returns An `IGatherController` to manage the search.
   */
  return function executeSearch(
    providers: ISearchProvider<ProviderContext>[],
    params: TuffQuery,
    onUpdate: TuffAggregatorCallback
  ): IGatherController {
    console.log(`Starting search with ${providers.length} providers.`)

    /**
     * The core search handler.
     * @param signal - The AbortSignal to cancel the search.
     * @param resolve - The promise resolver to call when the search is complete.
     */
    async function handleGather(
      signal: AbortSignal,
      resolve: (value: number | PromiseLike<number>) => void
    ): Promise<number> {
      const allResults: TuffSearchResult[] = []
      const sourceStats: ExtendedSourceStat[] = []
      const taskQueue = [...providers]
      let pushBuffer: TuffSearchResult[] = []

      let completedCount = 0
      let hasFlushedFirstBatch = false
      let coalesceTimeoutId: NodeJS.Timeout | null = null

      /**
       * Flushes the result buffer and sends updates via the onUpdate callback.
       * @param isFinalFlush - If true, signals that the search is complete.
       */
      const flushBuffer = (isFinalFlush = false): void => {
        if (coalesceTimeoutId) {
          clearTimeout(coalesceTimeoutId)
          coalesceTimeoutId = null
        }

        if (pushBuffer.length > 0) {
          const itemsCount = allResults.reduce((acc, curr) => acc + curr.items.length, 0)
          onUpdate({
            newResults: pushBuffer,
            totalCount: itemsCount,
            isDone: false,
            sourceStats: sourceStats as TuffSearchResult['sources']
          })
          pushBuffer = []
        }

        if (isFinalFlush) {
          const itemsCount = allResults.reduce((acc, curr) => acc + curr.items.length, 0)
          onUpdate({
            newResults: [],
            totalCount: itemsCount,
            isDone: true,
            sourceStats: sourceStats as TuffSearchResult['sources']
          })
          resolve(itemsCount)
        }
      }

      const debouncedFlush = debounce(flushBuffer, debouncePushMs)

      /**
       * Handles a new result from a provider, adding it to the buffer and managing the flush logic.
       * @param result - The search result.
       */
      const onNewResult = (result: TuffSearchResult): void => {
        allResults.push(result)
        pushBuffer.push(result)
        completedCount++

        if (!hasFlushedFirstBatch) {
          hasFlushedFirstBatch = true
          // For the first result, wait a short grace period before flushing.
          coalesceTimeoutId = setTimeout(() => debouncedFlush(), firstBatchGraceMs)
        } else {
          // For subsequent results, reset the coalescing gap.
          if (coalesceTimeoutId) clearTimeout(coalesceTimeoutId)
          coalesceTimeoutId = setTimeout(() => debouncedFlush(), coalesceGapMs)
        }

        // If all tasks are done, perform a final flush immediately.
        if (completedCount === providers.length) {
          debouncedFlush.flush() // Use lodash debounce's flush method
          flushBuffer(true)
        }
      }

      /**
       * Runs the worker pool to process providers concurrently.
       */
      const runWorkerPool = async (): Promise<void> => {
        // Set up abort handler to notify about cancellation
        signal.addEventListener('abort', () => {
          // Clean up any pending timeouts
          if (coalesceTimeoutId) {
            clearTimeout(coalesceTimeoutId)
            coalesceTimeoutId = null
          }
          debouncedFlush.cancel()

          // Notify about cancellation
          console.debug('[SearchGatherer] Search was cancelled. Notifying callback.')
          onUpdate({
            newResults: [],
            totalCount: allResults.reduce((acc, curr) => acc + curr.items.length, 0),
            isDone: true,
            cancelled: true,
            sourceStats: sourceStats as TuffSearchResult['sources']
          })
          resolve(0) // Resolve with 0 to indicate cancellation
          return
        })

        const workers = Array(concurrency)
          .fill(0)
          .map(async (_, i) => {
            // Stagger the start of each worker to avoid resource contention.
            await new Promise((resolve) => setTimeout(resolve, i * 10))
            while (taskQueue.length > 0) {
              const provider = taskQueue.shift()
              if (!provider) continue

              const startTime = performance.now()
              let status: 'success' | 'timeout' | 'error' = 'success'
              let resultCount = 0

              try {
                if (signal.aborted) return

                const searchPromise = provider.onSearch(params, signal)
                const searchResult = await withTimeout(searchPromise, taskTimeoutMs)

                resultCount = searchResult.items.length
                onNewResult(searchResult)
              } catch (error) {
                status = 'error'
                if (error instanceof Error && error.name === 'TimeoutError') {
                  status = 'timeout'
                }
                console.error(`Provider [${provider.id}] failed:`, error)
              } finally {
                const duration = performance.now() - startTime
                // Do not log or record stats for aborted tasks.
                if (!signal.aborted) {
                  logProviderCompletion(provider, duration, resultCount, status)
                  sourceStats.push({
                    providerId: provider.id,
                    providerName: provider.name || provider.constructor.name,
                    duration,
                    resultCount,
                    status
                  })
                }
              }
            }
          })
        await Promise.all(workers)
      }

      /**
       * Logs the completion details of a provider with styled output.
       * @param provider - The provider that finished.
       * @param duration - The execution duration in milliseconds.
       * @param resultCount - The number of results returned.
       * @param status - The final status of the provider.
       */
      const logProviderCompletion = (
        provider: ISearchProvider<ProviderContext>,
        duration: number,
        resultCount: number,
        status: 'success' | 'timeout' | 'error'
      ): void => {
        let durationStr: string
        if (duration < 50) {
          durationStr = chalk.gray(`${duration.toFixed(1)}ms`)
        } else if (duration < 200) {
          durationStr = chalk.bgYellow.black(`${duration.toFixed(1)}ms`)
        } else {
          durationStr = chalk.bgRed.white(`${duration.toFixed(1)}ms`)
        }
        console.log(
          `Provider [${provider.id}] finished in ${durationStr} with ${resultCount} results (${status})`
        )
      }

      const run = async (): Promise<number> => {
        await runWorkerPool()
        console.log('All search tasks completed.')
        flushBuffer(true)
        return allResults.reduce((acc, curr) => acc + curr.items.length, 0)
      }

      return run()
    }

    return createGatherController((signal, resolve) => {
      return handleGather(signal, resolve)
    })
  }
}

export const gatherAggregator = createGatherAggregator()
