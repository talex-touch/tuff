import type {
  IGatherController,
  ISearchProvider,
  ITuffGatherOptions,
  SearchPriorityLayer,
  TuffAggregatorCallback,
  TuffQuery,
  TuffSearchResult,
  TuffUpdate
} from '@talex-touch/utils'
import type { ProviderContext } from './types'
import { performance } from 'node:perf_hooks'
import { getLogger } from '@talex-touch/utils/common/logger'

import chalk from 'chalk'
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

interface FastLayerOutcome {
  immediateResults: TuffSearchResult[]
  didTimeout: boolean
  completion: Promise<void>
  releaseLateResults: () => void
}

type GatherDispatchResult = 'delivered' | 'skipped'
type GatherDispatchState = 'open' | 'terminal-pending' | 'terminal-delivered' | 'failed'

interface GatherUpdateDispatcher {
  emit: (update: TuffUpdate) => Promise<GatherDispatchResult>
}

/**
 * @constant defaultTuffGatherOptions
 * @description Default configuration for the aggregator.
 */
const defaultTuffGatherOptions: Required<ITuffGatherOptions> = {
  taskTimeoutMs: 3000,
  // Layered search options
  fastLayerTimeoutMs: 80,
  deferredLayerDelayMs: 50,
  fastLayerConcurrency: 3,
  deferredLayerConcurrency: 2
}

const INTERNAL_GATHER_ABORT_REASON = Symbol('internal-gather-abort')

/**
 * Utility function to create a delay promise
 */
const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

function createProviderTimeoutError(timeoutMs: number): Error {
  const error = new Error(`Search provider timed out after ${timeoutMs}ms`)
  error.name = 'TimeoutError'
  return error
}

function createProviderAbortError(): Error {
  const error = new Error('Search provider aborted')
  error.name = 'AbortError'
  return error
}

async function runProviderSearchWithTimeout(
  provider: ISearchProvider<ProviderContext>,
  params: TuffQuery,
  signal: AbortSignal,
  timeoutMs: number
): Promise<TuffSearchResult> {
  const providerController = new AbortController()

  if (signal.aborted) {
    providerController.abort()
    throw createProviderAbortError()
  }

  let timeout: ReturnType<typeof setTimeout> | undefined
  let abortListener: (() => void) | null = null
  const timeoutState = Promise.withResolvers<never>()
  const abortState = Promise.withResolvers<never>()

  timeout = setTimeout(() => {
    timeoutState.reject(createProviderTimeoutError(timeoutMs))
    providerController.abort()
  }, timeoutMs)

  abortListener = () => {
    abortState.reject(createProviderAbortError())
    providerController.abort()
  }
  signal.addEventListener('abort', abortListener, { once: true })

  try {
    return await Promise.race([
      provider.onSearch(params, providerController.signal),
      timeoutState.promise,
      abortState.promise
    ])
  } finally {
    clearTimeout(timeout)
    if (abortListener) {
      signal.removeEventListener('abort', abortListener)
    }
  }
}

/**
 * Count total items from search results
 */
function countItems(results: TuffSearchResult[]): number {
  return results.reduce((acc, curr) => acc + curr.items.length, 0)
}

function createGatherUpdateDispatcher(onUpdate: TuffAggregatorCallback): GatherUpdateDispatcher {
  let state: GatherDispatchState = 'open'
  let terminalGeneration = 0
  let failure: unknown
  let tail: Promise<unknown> = Promise.resolve()
  let terminalPromise: Promise<'delivered'> | null = null

  const invoke = async (update: TuffUpdate): Promise<'delivered'> => {
    try {
      await onUpdate(update)
      return 'delivered'
    } catch (error) {
      if (state !== 'failed') {
        state = 'failed'
        failure = error
      }
      throw failure
    }
  }

  return {
    emit(update) {
      if (state === 'failed') {
        return Promise.reject(failure)
      }

      if (update.isDone) {
        if (terminalPromise) {
          return terminalPromise.then(() => 'skipped')
        }

        state = 'terminal-pending'
        terminalGeneration++
        const task = tail.then(async () => {
          if (state === 'failed') {
            throw failure
          }

          const result = await invoke(update)
          state = 'terminal-delivered'
          return result
        })
        terminalPromise = task
        tail = task
        return task
      }

      if (state !== 'open') {
        return Promise.resolve('skipped')
      }

      const generation = terminalGeneration
      const task = tail.then(async () => {
        if (state === 'failed') {
          throw failure
        }
        if (state !== 'open' || generation !== terminalGeneration) {
          return 'skipped' as const
        }
        return invoke(update)
      })
      tail = task
      return task
    }
  }
}

function recordGatherSearchMetrics(totalDuration: number, sourceStats: ExtendedSourceStat[]): void {
  const providerTimings = sourceStats.reduce<Record<string, number>>((acc, stat) => {
    acc[stat.providerId || stat.providerName] = stat.duration
    return acc
  }, {})
  analyticsModule.recordSearchMetrics(totalDuration, providerTimings)
}

/**
 * Creates a search controller that manages the lifecycle of a search operation.
 * @param callback - The function that executes the search logic.
 * @returns An `IGatherController` to manage the search.
 */
function createGatherController(
  callback: (
    signal: AbortSignal,
    resolve: (value: number) => void,
    reject: (reason: unknown) => void
  ) => Promise<number>
): IGatherController {
  const controller = new AbortController()
  const { signal } = controller
  let settled = false
  let resolvePromise!: (value: number) => void
  let rejectPromise!: (reason: unknown) => void
  const promise = new Promise<number>((resolve, reject) => {
    resolvePromise = resolve
    rejectPromise = reject
  })

  const resolve = (value: number): void => {
    if (settled) return
    settled = true
    resolvePromise(value)
  }

  const reject = (reason: unknown): void => {
    if (settled) return
    settled = true
    if (!signal.aborted) {
      controller.abort(INTERNAL_GATHER_ABORT_REASON)
    }
    rejectPromise(reason)
  }

  try {
    void callback(signal, resolve, reject).catch(reject)
  } catch (error) {
    reject(error)
  }

  return {
    promise,
    abort: () => {
      if (!settled && !controller.signal.aborted) {
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
    return createLayeredSearchController(providers, params, onUpdate, config)
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

  return createGatherController(async (signal, resolve, reject) => {
    const startTime = performance.now()
    const allResults: TuffSearchResult[] = []
    const sourceStats: ExtendedSourceStat[] = []
    const dispatcher = createGatherUpdateDispatcher(onUpdate)
    let isAborted = signal.aborted

    const emitCancellation = async (): Promise<void> => {
      const result = await dispatcher.emit({
        newResults: [],
        totalCount: countItems(allResults),
        isDone: true,
        cancelled: true,
        sourceStats: sourceStats as TuffSearchResult['sources']
      })
      if (result === 'delivered') {
        resolve(0)
      }
    }

    const handleAbort = (): void => {
      isAborted = true
      if (signal.reason === INTERNAL_GATHER_ABORT_REASON) {
        return
      }

      gatherLog.debug('Layered search cancelled')
      void emitCancellation().catch(reject)
    }

    signal.addEventListener('abort', handleAbort, { once: true })
    if (signal.aborted) {
      handleAbort()
    }

    if (providers.length === 0) {
      searchLogger.logSearchPhase('Layered Search', 'No providers available')
      const dispatchResult = await dispatcher.emit({
        newResults: [],
        totalCount: 0,
        isDone: true,
        sourceStats: []
      })
      if (dispatchResult === 'delivered') {
        resolve(0)
      }
      return 0
    }

    // Split providers by priority
    const fastProviders = providers.filter((p) => p.priority === 'fast')
    const deferredProviders = providers.filter((p) => p.priority !== 'fast')

    searchLogger.logSearchPhase(
      'Layered Search',
      `Fast: ${fastProviders.length}, Deferred: ${deferredProviders.length}`
    )

    // ==================== FAST LAYER ====================
    let fastLayerOutcome: FastLayerOutcome | null = null
    if (fastProviders.length > 0 && !isAborted) {
      searchLogger.logSearchPhase('Fast Layer', `Starting with ${fastProviders.length} providers`)

      fastLayerOutcome = await runFastLayer(
        fastProviders,
        params,
        signal,
        fastLayerTimeoutMs,
        fastLayerConcurrency,
        taskTimeoutMs,
        sourceStats,
        async (lateResult) => {
          if (isAborted) return
          allResults.push(lateResult)
          await dispatcher.emit({
            newResults: [lateResult],
            totalCount: countItems(allResults),
            isDone: false,
            sourceStats: sourceStats as TuffSearchResult['sources'],
            layer: 'deferred'
          })
        }
      )

      allResults.push(...fastLayerOutcome.immediateResults)

      // Immediately push fast layer results
      if (!isAborted) {
        const hasPendingAfterFast = deferredProviders.length > 0 || fastLayerOutcome.didTimeout
        const fastDuration = performance.now() - startTime
        searchLogger.logSearchPhase(
          'Fast Layer Complete',
          `${countItems(fastLayerOutcome.immediateResults)} items in ${fastDuration.toFixed(1)}ms`
        )

        if (!hasPendingAfterFast) {
          searchLogger.logSearchPhase('Search Complete', 'No deferred providers')
          recordGatherSearchMetrics(fastDuration, sourceStats)
        }

        try {
          const dispatchResult = await dispatcher.emit({
            newResults: fastLayerOutcome.immediateResults,
            totalCount: countItems(allResults),
            isDone: !hasPendingAfterFast,
            sourceStats: sourceStats as TuffSearchResult['sources'],
            layer: 'fast'
          })
          if (!hasPendingAfterFast && dispatchResult === 'delivered') {
            const totalCount = countItems(allResults)
            resolve(totalCount)
            return totalCount
          }
        } finally {
          fastLayerOutcome.releaseLateResults()
        }
      } else {
        fastLayerOutcome.releaseLateResults()
      }
    }

    // Check if aborted before deferred layer
    if (isAborted) {
      return 0
    }

    const hasPendingSearch = deferredProviders.length > 0 || fastLayerOutcome?.didTimeout === true

    // ==================== DEFERRED LAYER ====================
    if (hasPendingSearch && !isAborted) {
      if (deferredProviders.length > 0) {
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
          sourceStats,
          async (result) => {
            if (isAborted) return

            allResults.push(result)

            await dispatcher.emit({
              newResults: [result],
              totalCount: countItems(allResults),
              isDone: false,
              sourceStats: sourceStats as TuffSearchResult['sources'],
              layer: 'deferred'
            })
          }
        )
      }

      if (fastLayerOutcome?.didTimeout) {
        await fastLayerOutcome.completion
      }

      // Final update after deferred and late fast providers complete
      if (!isAborted) {
        const totalDuration = performance.now() - startTime
        searchLogger.logSearchPhase(
          'Search Complete',
          `${countItems(allResults)} items in ${totalDuration.toFixed(1)}ms`
        )

        recordGatherSearchMetrics(totalDuration, sourceStats)

        const dispatchResult = await dispatcher.emit({
          newResults: [],
          totalCount: countItems(allResults),
          isDone: true,
          sourceStats: sourceStats as TuffSearchResult['sources'],
          layer: 'deferred'
        })
        if (dispatchResult === 'delivered') {
          resolve(countItems(allResults))
        }
        return countItems(allResults)
      }
    }

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
  sourceStats: ExtendedSourceStat[],
  onLateResult: (result: TuffSearchResult) => Promise<void>
): Promise<FastLayerOutcome> {
  const results: TuffSearchResult[] = []
  const queue = [...providers]
  let completed = 0
  const total = providers.length
  let didTimeout = false
  let releaseLateResults!: () => void
  const lateResultsReady = new Promise<void>((resolve) => {
    releaseLateResults = resolve
  })

  // Create a race between provider execution and overall timeout
  const worker = async (): Promise<void> => {
    while (queue.length > 0 && !signal.aborted) {
      const provider = queue.shift()
      if (!provider) continue

      const startTime = performance.now()
      let status: ExtendedSourceStat['status'] = 'success'
      let resultCount = 0
      let result: TuffSearchResult | null = null

      try {
        searchLogger.providerCall(provider.id)
        result = await runProviderSearchWithTimeout(provider, params, signal, taskTimeoutMs)

        resultCount = result.items.length
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

      if (status === 'success' && result && !signal.aborted) {
        if (didTimeout) {
          await lateResultsReady
          if (!signal.aborted) {
            await onLateResult(result)
          }
        } else {
          results.push(result)
        }
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, queue.length) }, () => worker())
  const providerPromise = Promise.all(workers).then(() => undefined)

  let timeout: ReturnType<typeof setTimeout> | undefined
  const timeoutPromise = new Promise<'timeout'>((resolveTimeout) => {
    timeout = setTimeout(() => {
      if (completed < total) {
        didTimeout = true
        gatherLog.debug(`Fast layer timeout after ${timeoutMs}ms`, { meta: { completed, total } })
      }
      resolveTimeout('timeout')
    }, timeoutMs)
  })

  // Race: either all providers complete or timeout expires
  const fastLayerState = await Promise.race([
    providerPromise.then(() => 'completed' as const),
    timeoutPromise
  ])
  clearTimeout(timeout)

  didTimeout = fastLayerState === 'timeout'

  return {
    immediateResults: results,
    didTimeout,
    completion: providerPromise,
    releaseLateResults
  }
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
  sourceStats: ExtendedSourceStat[],
  onResult: (result: TuffSearchResult) => Promise<void>
): Promise<void> {
  const queue = [...providers]

  const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
    while (queue.length > 0 && !signal.aborted) {
      const provider = queue.shift()
      if (!provider) continue

      const startTime = performance.now()
      let status: ExtendedSourceStat['status'] = 'success'
      let resultCount = 0

      let result: TuffSearchResult | null = null

      try {
        searchLogger.providerCall(provider.id)
        result = await runProviderSearchWithTimeout(provider, params, signal, taskTimeoutMs)

        resultCount = result.items.length
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
          gatherLog.warn(`Deferred provider [${provider.id}] failed`, { error })
        }
      } finally {
        const duration = performance.now() - startTime
        if (!signal.aborted) {
          const stat: ExtendedSourceStat = {
            providerId: provider.id,
            providerName: provider.name || provider.id,
            duration,
            resultCount,
            status,
            layer: 'deferred'
          }
          sourceStats.push(stat)
          logProviderCompletion(provider, duration, resultCount, status, 'deferred')
        }
      }

      if (status === 'success' && result && !signal.aborted) {
        await onResult(result)
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

export const gatherAggregator = createGatherAggregator()
