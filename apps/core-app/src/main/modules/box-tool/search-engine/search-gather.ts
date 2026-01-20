import type {
  IGatherController,
  ISearchProvider,
  ITuffGatherOptions,
  SearchPriorityLayer,
  TuffAggregatorCallback,
  TuffQuery,
  TuffSearchResult
} from '@talex-touch/utils'
import type { ProviderContext } from './types'
import { performance } from 'node:perf_hooks'
import { withTimeout } from '@talex-touch/utils'
import { getLogger } from '@talex-touch/utils/common/logger'

import chalk from 'chalk'
import { debounce } from 'lodash'
import { analyticsModule } from '../../analytics'
import { searchLogger } from './search-logger'

const gatherLog = getLogger('search-engine')

/**
 * @interface ExtendedSourceStat
 * @description Extends the source statistics interface to include timing and status.
 */
interface ExtendedSourceStat {
  providerId: string
  providerName: string
  duration: number
  resultCount: number
  status: 'success' | 'timeout' | 'error' | 'aborted'
  layer?: SearchPriorityLayer
}

/**
 * @constant defaultTuffGatherOptions
 * @description Default configuration for the aggregator.
 */
const defaultTuffGatherOptions: Required<ITuffGatherOptions> = {
  concurrency: 4,
  coalesceGapMs: 50,
  firstBatchGraceMs: 20,
  debouncePushMs: 8,
  taskTimeoutMs: 3000,
  // Layered search options
  enableLayeredSearch: true,
  fastLayerTimeoutMs: 80,
  deferredLayerDelayMs: 50,
  fastLayerConcurrency: 3,
  deferredLayerConcurrency: 2
}

/**
 * Utility function to create a delay promise
 */
const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Count total items from search results
 */
function countItems(results: TuffSearchResult[]): number {
  return results.reduce((acc, curr) => acc + curr.items.length, 0)
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
        gatherLog.debug('Aborting search')
        controller.abort()
      }
    },
    signal
  }
}

/**
 * Creates the core search aggregator with layered search support.
 *
 * Features:
 * - **Layered Search**: Splits providers into fast and deferred layers
 * - **Fast Layer**: Returns results immediately with timeout protection
 * - **Deferred Layer**: Runs asynchronously after fast layer completes
 * - **Smart Batching**: Reduces UI flicker with result coalescing
 * - **Cancellation**: Full AbortSignal support throughout
 *
 * @param options - Configuration for the aggregator.
 * @returns A function that executes a search with the given providers and query.
 */
export function createGatherAggregator(options: ITuffGatherOptions = {}) {
  const config = { ...defaultTuffGatherOptions, ...options }

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
    searchLogger.logSearchPhase('Gatherer Setup', `Initializing ${providers.length} providers`)
    searchLogger.gathererStart(providers.length, params.text)

    // Use layered search if enabled, otherwise fall back to legacy mode
    if (config.enableLayeredSearch) {
      return createLayeredSearchController(providers, params, onUpdate, config)
    } else {
      return createLegacySearchController(providers, params, onUpdate, config)
    }
  }
}

/**
 * Creates a layered search controller with fast and deferred layers.
 */
function createLayeredSearchController(
  providers: ISearchProvider<ProviderContext>[],
  params: TuffQuery,
  onUpdate: TuffAggregatorCallback,
  config: Required<ITuffGatherOptions>
): IGatherController {
  const {
    fastLayerTimeoutMs,
    deferredLayerDelayMs,
    fastLayerConcurrency,
    deferredLayerConcurrency,
    taskTimeoutMs
  } = config

  return createGatherController(async (signal, resolve) => {
    const startTime = performance.now()
    const allResults: TuffSearchResult[] = []
    const sourceStats: ExtendedSourceStat[] = []

    if (providers.length === 0) {
      searchLogger.logSearchPhase('Layered Search', 'No providers available')
      onUpdate({
        newResults: [],
        totalCount: 0,
        isDone: true,
        sourceStats: []
      })
      resolve(0)
      return 0
    }

    // Split providers by priority
    const fastProviders = providers.filter((p) => p.priority === 'fast')
    const deferredProviders = providers.filter((p) => p.priority !== 'fast')

    searchLogger.logSearchPhase(
      'Layered Search',
      `Fast: ${fastProviders.length}, Deferred: ${deferredProviders.length}`
    )

    // Set up abort handler
    let isAborted = false
    signal.addEventListener('abort', () => {
      isAborted = true
      gatherLog.debug('Layered search cancelled')
      onUpdate({
        newResults: [],
        totalCount: countItems(allResults),
        isDone: true,
        cancelled: true,
        sourceStats: sourceStats as TuffSearchResult['sources']
      })
      resolve(0)
    })

    // ==================== FAST LAYER ====================
    if (fastProviders.length > 0 && !isAborted) {
      searchLogger.logSearchPhase('Fast Layer', `Starting with ${fastProviders.length} providers`)

      const fastResults = await runFastLayer(
        fastProviders,
        params,
        signal,
        fastLayerTimeoutMs,
        fastLayerConcurrency,
        taskTimeoutMs,
        sourceStats
      )

      allResults.push(...fastResults)

      // Immediately push fast layer results
      if (!isAborted) {
        const fastDuration = performance.now() - startTime
        searchLogger.logSearchPhase(
          'Fast Layer Complete',
          `${countItems(fastResults)} items in ${fastDuration.toFixed(1)}ms`
        )

        onUpdate({
          newResults: fastResults,
          totalCount: countItems(allResults),
          isDone: deferredProviders.length === 0,
          sourceStats: sourceStats as TuffSearchResult['sources'],
          layer: 'fast'
        })
      }
    }

    // Check if aborted before deferred layer
    if (isAborted) {
      return 0
    }

    // ==================== DEFERRED LAYER ====================
    if (deferredProviders.length > 0 && !isAborted) {
      // Delay to let UI render fast layer results
      await delay(deferredLayerDelayMs)

      if (isAborted) {
        return countItems(allResults)
      }

      searchLogger.logSearchPhase(
        'Deferred Layer',
        `Starting with ${deferredProviders.length} providers`
      )

      await runDeferredLayer(
        deferredProviders,
        params,
        signal,
        deferredLayerConcurrency,
        taskTimeoutMs,
        (result, stat) => {
          if (isAborted) return

          allResults.push(result)
          sourceStats.push(stat)

          onUpdate({
            newResults: [result],
            totalCount: countItems(allResults),
            isDone: false,
            sourceStats: sourceStats as TuffSearchResult['sources'],
            layer: 'deferred'
          })
        }
      )

      // Final update after deferred layer completes
      if (!isAborted) {
        const totalDuration = performance.now() - startTime
        searchLogger.logSearchPhase(
          'Search Complete',
          `${countItems(allResults)} items in ${totalDuration.toFixed(1)}ms`
        )

        const providerTimings = sourceStats.reduce<Record<string, number>>((acc, stat) => {
          acc[stat.providerId || stat.providerName] = stat.duration
          return acc
        }, {})
        analyticsModule.recordSearchMetrics(totalDuration, providerTimings)

        onUpdate({
          newResults: [],
          totalCount: countItems(allResults),
          isDone: true,
          sourceStats: sourceStats as TuffSearchResult['sources'],
          layer: 'deferred'
        })
      }
    } else if (!isAborted && deferredProviders.length === 0) {
      // No deferred providers, search is already complete
      searchLogger.logSearchPhase('Search Complete', 'No deferred providers')
    }

    resolve(countItems(allResults))
    return countItems(allResults)
  })
}

/**
 * Runs fast layer providers with overall timeout protection.
 * Returns as soon as timeout expires or all providers complete.
 */
async function runFastLayer(
  providers: ISearchProvider<ProviderContext>[],
  params: TuffQuery,
  signal: AbortSignal,
  timeoutMs: number,
  concurrency: number,
  taskTimeoutMs: number,
  sourceStats: ExtendedSourceStat[]
): Promise<TuffSearchResult[]> {
  const results: TuffSearchResult[] = []
  const queue = [...providers]
  let completed = 0
  const total = providers.length

  // Create a race between provider execution and overall timeout
  const providerPromise = new Promise<void>((resolveAll) => {
    const worker = async () => {
      while (queue.length > 0 && !signal.aborted) {
        const provider = queue.shift()
        if (!provider) continue

        const startTime = performance.now()
        let status: ExtendedSourceStat['status'] = 'success'
        let resultCount = 0

        try {
          searchLogger.providerCall(provider.id)
          const searchPromise = provider.onSearch(params, signal)
          const result = await withTimeout(searchPromise, taskTimeoutMs)

          resultCount = result.items.length
          results.push(result)
          searchLogger.providerResult(provider.id, resultCount)
        } catch (error) {
          if (signal.aborted) {
            status = 'aborted'
          } else if (error instanceof Error && error.name === 'TimeoutError') {
            status = 'timeout'
            searchLogger.providerTimeout(provider.id, taskTimeoutMs)
          } else {
            status = 'error'
            searchLogger.providerError(
              provider.id,
              error instanceof Error ? error.message : 'Unknown error'
            )
          }
        } finally {
          const duration = performance.now() - startTime
          if (!signal.aborted) {
            sourceStats.push({
              providerId: provider.id,
              providerName: provider.name || provider.id,
              duration,
              resultCount,
              status,
              layer: 'fast'
            })
            logProviderCompletion(provider, duration, resultCount, status, 'fast')
          }
          completed++
        }
      }
    }

    const workers = Array.from({ length: Math.min(concurrency, queue.length) }, () => worker())

    void Promise.all(workers).then(() => resolveAll())
  })

  const timeoutPromise = new Promise<void>((resolveTimeout) => {
    setTimeout(() => {
      if (completed < total) {
        gatherLog.debug(`Fast layer timeout after ${timeoutMs}ms`, { meta: { completed, total } })
      }
      resolveTimeout()
    }, timeoutMs)
  })

  // Race: either all providers complete or timeout expires
  await Promise.race([providerPromise, timeoutPromise])

  return results
}

/**
 * Runs deferred layer providers, pushing results incrementally.
 */
async function runDeferredLayer(
  providers: ISearchProvider<ProviderContext>[],
  params: TuffQuery,
  signal: AbortSignal,
  concurrency: number,
  taskTimeoutMs: number,
  onResult: (result: TuffSearchResult, stat: ExtendedSourceStat) => void
): Promise<void> {
  const queue = [...providers]

  const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
    while (queue.length > 0 && !signal.aborted) {
      const provider = queue.shift()
      if (!provider) continue

      const startTime = performance.now()
      let status: ExtendedSourceStat['status'] = 'success'
      let resultCount = 0

      try {
        searchLogger.providerCall(provider.id)
        const searchPromise = provider.onSearch(params, signal)
        const result = await withTimeout(searchPromise, taskTimeoutMs)

        resultCount = result.items.length
        searchLogger.providerResult(provider.id, resultCount)

        const stat: ExtendedSourceStat = {
          providerId: provider.id,
          providerName: provider.name || provider.id,
          duration: performance.now() - startTime,
          resultCount,
          status: 'success',
          layer: 'deferred'
        }

        onResult(result, stat)
      } catch (error) {
        if (signal.aborted) {
          status = 'aborted'
        } else if (error instanceof Error && error.name === 'TimeoutError') {
          status = 'timeout'
          searchLogger.providerTimeout(provider.id, taskTimeoutMs)
        } else {
          status = 'error'
          searchLogger.providerError(
            provider.id,
            error instanceof Error ? error.message : 'Unknown error'
          )
          gatherLog.warn(`Deferred provider [${provider.id}] failed`, { error })
        }
      } finally {
        const duration = performance.now() - startTime
        if (!signal.aborted) {
          logProviderCompletion(provider, duration, resultCount, status, 'deferred')
        }
      }
    }
  })

  await Promise.all(workers)
}

/**
 * Logs the completion details of a provider with styled output.
 */
function logProviderCompletion(
  provider: ISearchProvider<ProviderContext>,
  duration: number,
  resultCount: number,
  status: ExtendedSourceStat['status'],
  layer: SearchPriorityLayer
): void {
  let durationStr: string
  if (duration < 50) {
    durationStr = chalk.gray(`${duration.toFixed(1)}ms`)
  } else if (duration < 200) {
    durationStr = chalk.bgYellow.black(`${duration.toFixed(1)}ms`)
  } else {
    durationStr = chalk.bgRed.white(`${duration.toFixed(1)}ms`)
  }

  const layerTag = layer === 'fast' ? chalk.cyan('[F]') : chalk.magenta('[D]')
  const message = `${layerTag} Provider [${provider.id}] finished in ${durationStr} with ${resultCount} results (${status})`
  if (status === 'success') {
    gatherLog.debug(message)
  } else {
    gatherLog.warn(message)
  }
}

/**
 * Legacy search controller (non-layered mode).
 * Keeps the original behavior for backward compatibility.
 */
function createLegacySearchController(
  providers: ISearchProvider<ProviderContext>[],
  params: TuffQuery,
  onUpdate: TuffAggregatorCallback,
  config: Required<ITuffGatherOptions>
): IGatherController {
  const { concurrency, coalesceGapMs, firstBatchGraceMs, debouncePushMs, taskTimeoutMs } = config

  return createGatherController(async (signal, resolve) => {
    const startTime = performance.now()
    const allResults: TuffSearchResult[] = []
    const sourceStats: ExtendedSourceStat[] = []
    const taskQueue = [...providers]
    let pushBuffer: TuffSearchResult[] = []

    let completedCount = 0
    let hasFlushedFirstBatch = false
    let coalesceTimeoutId: NodeJS.Timeout | null = null

    const flushBuffer = (isFinalFlush = false): void => {
      if (coalesceTimeoutId) {
        clearTimeout(coalesceTimeoutId)
        coalesceTimeoutId = null
      }

      if (pushBuffer.length > 0) {
        onUpdate({
          newResults: pushBuffer,
          totalCount: countItems(allResults),
          isDone: false,
          sourceStats: sourceStats as TuffSearchResult['sources']
        })
        pushBuffer = []
      }

      if (isFinalFlush) {
        onUpdate({
          newResults: [],
          totalCount: countItems(allResults),
          isDone: true,
          sourceStats: sourceStats as TuffSearchResult['sources']
        })
        resolve(countItems(allResults))
      }
    }

    const debouncedFlush = debounce(flushBuffer, debouncePushMs)
    const finalizeMetrics = () => {
      const totalDuration = performance.now() - startTime
      const providerTimings = sourceStats.reduce<Record<string, number>>((acc, stat) => {
        acc[stat.providerId || stat.providerName] = stat.duration
        return acc
      }, {})
      analyticsModule.recordSearchMetrics(totalDuration, providerTimings)
    }

    const onNewResult = (result: TuffSearchResult): void => {
      searchLogger.resultReceived(result.items.length)
      allResults.push(result)
      pushBuffer.push(result)
      completedCount++

      if (!hasFlushedFirstBatch) {
        hasFlushedFirstBatch = true
        searchLogger.firstBatch(firstBatchGraceMs)
        coalesceTimeoutId = setTimeout(() => debouncedFlush(), firstBatchGraceMs)
      } else {
        if (coalesceTimeoutId) clearTimeout(coalesceTimeoutId)
        coalesceTimeoutId = setTimeout(() => debouncedFlush(), coalesceGapMs)
      }

      if (completedCount === providers.length) {
        searchLogger.allProvidersComplete()
        debouncedFlush.flush()
        flushBuffer(true)
        finalizeMetrics()
      }
    }

    // Set up abort handler
    signal.addEventListener('abort', () => {
      if (coalesceTimeoutId) {
        clearTimeout(coalesceTimeoutId)
        coalesceTimeoutId = null
      }
      debouncedFlush.cancel()

      gatherLog.debug('Legacy search cancelled')
      onUpdate({
        newResults: [],
        totalCount: countItems(allResults),
        isDone: true,
        cancelled: true,
        sourceStats: sourceStats as TuffSearchResult['sources']
      })
      finalizeMetrics()
      resolve(0)
    })

    searchLogger.logSearchPhase('Legacy Worker Pool', `Starting ${concurrency} workers`)

    const workers = Array.from({ length: concurrency }, async (_, i) => {
      await new Promise((r) => setTimeout(r, i * 10))
      searchLogger.workerStart(i)

      while (taskQueue.length > 0) {
        const provider = taskQueue.shift()
        if (!provider) continue

        searchLogger.workerProcessing(i, provider.id)
        const startTime = performance.now()
        let status: ExtendedSourceStat['status'] = 'success'
        let resultCount = 0

        try {
          if (signal.aborted) return

          searchLogger.providerCall(provider.id)
          const searchPromise = provider.onSearch(params, signal)
          const searchResult = await withTimeout(searchPromise, taskTimeoutMs)

          resultCount = searchResult.items.length
          searchLogger.providerResult(provider.id, resultCount)
          onNewResult(searchResult)
        } catch (error) {
          if (error instanceof Error && error.name === 'TimeoutError') {
            status = 'timeout'
            searchLogger.providerTimeout(provider.id, taskTimeoutMs)
          } else {
            status = 'error'
            searchLogger.providerError(
              provider.id,
              error instanceof Error ? error.message : 'Unknown error'
            )
          }
          gatherLog.error(`Provider [${provider.id}] failed`, { error })
        } finally {
          const duration = performance.now() - startTime
          if (!signal.aborted) {
            sourceStats.push({
              providerId: provider.id,
              providerName: provider.name || provider.id,
              duration,
              resultCount,
              status
            })
          }
        }
      }
      searchLogger.workerComplete(i)
    })

    await Promise.all(workers)
    gatherLog.debug('All legacy search tasks completed')
    flushBuffer(true)
    finalizeMetrics()
    return countItems(allResults)
  })
}

export const gatherAggregator = createGatherAggregator()
