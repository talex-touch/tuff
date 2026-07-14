import type {
  ISearchProvider,
  TuffAggregatorCallback,
  TuffQuery,
  TuffSearchResult
} from '@talex-touch/utils'
import type { ProviderContext } from './types'
import { TuffSearchResultBuilder } from '@talex-touch/utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createGatherAggregator } from './search-gather'

const analyticsModuleMock = vi.hoisted(() => ({
  recordSearchMetrics: vi.fn()
}))

type CallbackSupportsPromise =
  Promise<void> extends ReturnType<TuffAggregatorCallback> ? true : false

const callbackSupportsPromise: CallbackSupportsPromise = true

vi.mock('../../analytics', () => ({
  analyticsModule: {
    recordSearchMetrics: analyticsModuleMock.recordSearchMetrics
  }
}))

vi.mock('@talex-touch/utils/common/logger', () => ({
  getLogger: () => ({
    debug: vi.fn(),
    warn: vi.fn()
  })
}))

vi.mock('./search-logger', () => ({
  searchLogger: {
    gathererStart: vi.fn(),
    logSearchPhase: vi.fn(),
    providerCall: vi.fn(),
    providerResult: vi.fn(),
    providerTimeout: vi.fn(),
    providerError: vi.fn()
  }
}))

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function createDeferred(): { promise: Promise<void>; resolve: () => void } {
  let resolvePromise!: () => void
  const promise = new Promise<void>((resolve) => {
    resolvePromise = resolve
  })

  return { promise, resolve: resolvePromise }
}
function buildResult(query: TuffQuery, id: string): TuffSearchResult {
  return new TuffSearchResultBuilder(query)
    .setItems([
      {
        id,
        source: { id: 'provider-fast', type: 'file' },
        render: { mode: 'default', basic: { title: id } }
      }
    ])
    .build()
}

describe('search gather fast layer timeout', () => {
  beforeEach(() => {
    analyticsModuleMock.recordSearchMetrics.mockClear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should emit late fast results and keep final total count correct', async () => {
    vi.useFakeTimers()
    const query: TuffQuery = { text: 'report', inputs: [] }
    const updates: Array<{ newResults: TuffSearchResult[]; totalCount: number; isDone: boolean }> =
      []
    const lateResult = Promise.withResolvers<TuffSearchResult>()

    const slowFastProvider: ISearchProvider<ProviderContext> = {
      id: 'provider-fast',
      name: 'Provider Fast',
      type: 'file',
      priority: 'fast',
      onSearch: async () => lateResult.promise
    }

    const gather = createGatherAggregator({
      fastLayerTimeoutMs: 30,
      deferredLayerDelayMs: 0,
      fastLayerConcurrency: 1,
      deferredLayerConcurrency: 1,
      taskTimeoutMs: 500
    })

    const controller = gather([slowFastProvider], query, (update) => {
      updates.push({
        newResults: update.newResults,
        totalCount: update.totalCount,
        isDone: update.isDone
      })
    })
    await vi.advanceTimersByTimeAsync(30)
    lateResult.resolve(buildResult(query, 'late-file'))
    const total = await controller.promise

    expect(total).toBe(1)
    expect(updates.length).toBe(3)
    expect(updates[0].newResults.length).toBe(0)
    expect(updates[0].isDone).toBe(false)
    expect(updates[1].newResults.length).toBe(1)
    expect(updates[1].isDone).toBe(false)
    expect(updates[2].newResults.length).toBe(0)
    expect(updates[2].isDone).toBe(true)
    expect(updates[2].totalCount).toBe(1)
  })

  it('aborts timed-out provider work instead of letting stale searches continue', async () => {
    vi.useFakeTimers()
    const query: TuffQuery = { text: 'stale query', inputs: [] }
    const updates: Array<{ totalCount: number; sourceStats?: TuffSearchResult['sources'] }> = []
    const aborted = Promise.withResolvers<void>()
    let providerSignal: AbortSignal | undefined

    const hangingProvider: ISearchProvider<ProviderContext> = {
      id: 'provider-hanging',
      name: 'Provider Hanging',
      type: 'file',
      priority: 'fast',
      onSearch: async (inputQuery, signal) => {
        providerSignal = signal
        signal.addEventListener('abort', () => aborted.resolve(), { once: true })
        await aborted.promise
        return buildResult(inputQuery, 'late-file')
      }
    }

    const gather = createGatherAggregator({
      fastLayerTimeoutMs: 120,
      deferredLayerDelayMs: 0,
      fastLayerConcurrency: 1,
      deferredLayerConcurrency: 1,
      taskTimeoutMs: 20
    })

    const controller = gather([hangingProvider], query, (update) => {
      updates.push({ totalCount: update.totalCount, sourceStats: update.sourceStats })
    })

    await vi.advanceTimersByTimeAsync(20)
    const total = await controller.promise
    await aborted.promise

    expect(total).toBe(0)
    expect(providerSignal?.aborted).toBe(true)
    expect(updates[0]?.totalCount).toBe(0)
    expect(updates[0]?.sourceStats?.[0]).toMatchObject({
      providerId: 'provider-hanging',
      status: 'timeout',
      resultCount: 0,
      layer: 'fast'
    })
  })

  it('clears fast-layer timeout timers once fast providers complete', async () => {
    vi.useFakeTimers()
    const query: TuffQuery = { text: 'instant query', inputs: [] }
    const fastProvider: ISearchProvider<ProviderContext> = {
      id: 'provider-instant',
      name: 'Provider Instant',
      type: 'application',
      priority: 'fast',
      onSearch: async (inputQuery) => buildResult(inputQuery, 'instant-app')
    }

    const gather = createGatherAggregator({
      fastLayerTimeoutMs: 1000,
      deferredLayerDelayMs: 0,
      fastLayerConcurrency: 1,
      deferredLayerConcurrency: 1,
      taskTimeoutMs: 500
    })

    const controller = gather([fastProvider], query, () => {})

    await expect(controller.promise).resolves.toBe(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('records provider timing metrics for analytics after search completes', async () => {
    const query: TuffQuery = { text: 'provider metrics', inputs: [] }

    const okProvider: ISearchProvider<ProviderContext> = {
      id: 'provider-ok',
      name: 'Provider OK',
      type: 'application',
      priority: 'fast',
      onSearch: async (inputQuery) => buildResult(inputQuery, 'ok-app')
    }
    const failingProvider: ISearchProvider<ProviderContext> = {
      id: 'provider-fail',
      name: 'Provider Fail',
      type: 'file',
      priority: 'fast',
      onSearch: async () => {
        throw new Error('provider failed')
      }
    }

    const gather = createGatherAggregator({
      fastLayerTimeoutMs: 80,
      deferredLayerDelayMs: 0,
      fastLayerConcurrency: 2,
      deferredLayerConcurrency: 1,
      taskTimeoutMs: 500
    })

    const controller = gather([okProvider, failingProvider], query, () => {})
    await controller.promise

    expect(analyticsModuleMock.recordSearchMetrics).toHaveBeenCalledTimes(1)
    const [, providerTimings] = analyticsModuleMock.recordSearchMetrics.mock.calls[0]
    expect(providerTimings['provider-ok']).toEqual(expect.any(Number))
    expect(providerTimings['provider-fail']).toEqual(expect.any(Number))
  })
})

describe('search gather async update ordering', () => {
  beforeEach(() => {
    analyticsModuleMock.recordSearchMetrics.mockClear()
  })

  it('serializes async callback completion through the final update', async () => {
    const query: TuffQuery = { text: 'ordered updates', inputs: [] }
    const callbackStarts: string[] = []
    const callbackCompletions: string[] = []
    let activeCallbacks = 0
    let maxActiveCallbacks = 0

    const providers: ISearchProvider<ProviderContext>[] = [
      {
        id: 'provider-fast',
        name: 'Provider Fast',
        type: 'file',
        priority: 'fast',
        onSearch: async (inputQuery) => buildResult(inputQuery, 'fast-result')
      },
      {
        id: 'provider-late-fast',
        name: 'Provider Late Fast',
        type: 'file',
        priority: 'fast',
        onSearch: async (inputQuery) => {
          await wait(60)
          return buildResult(inputQuery, 'late-fast-result')
        }
      },
      {
        id: 'provider-deferred-one',
        name: 'Provider Deferred One',
        type: 'file',
        priority: 'deferred',
        onSearch: async (inputQuery) => buildResult(inputQuery, 'deferred-one')
      },
      {
        id: 'provider-deferred-two',
        name: 'Provider Deferred Two',
        type: 'file',
        priority: 'deferred',
        onSearch: async (inputQuery) => buildResult(inputQuery, 'deferred-two')
      }
    ]

    const gather = createGatherAggregator({
      fastLayerTimeoutMs: 10,
      deferredLayerDelayMs: 0,
      fastLayerConcurrency: 2,
      deferredLayerConcurrency: 2,
      taskTimeoutMs: 500
    })

    const controller = gather(providers, query, async (update) => {
      const label = update.isDone
        ? 'final'
        : (update.newResults[0]?.items[0]?.id ?? `${update.layer}-empty`)
      const callbackDelay =
        label === 'fast-result' ? 25 : label === 'deferred-one' ? 15 : label === 'final' ? 0 : 5

      callbackStarts.push(label)
      activeCallbacks++
      maxActiveCallbacks = Math.max(maxActiveCallbacks, activeCallbacks)
      await wait(callbackDelay)
      callbackCompletions.push(label)
      activeCallbacks--
    })

    await controller.promise
    await wait(40)

    expect(callbackSupportsPromise).toBe(true)
    expect(callbackStarts[0]).toBe('fast-result')
    expect(callbackStarts.at(-1)).toBe('final')
    expect(callbackCompletions).toEqual(callbackStarts)
    expect(maxActiveCallbacks).toBe(1)
  })

  it('keeps the first normal terminal when abort is requested during its callback', async () => {
    const query: TuffQuery = { text: 'normal terminal wins', inputs: [] }
    const terminalStarted = createDeferred()
    const terminalRelease = createDeferred()
    const callbackOrder: string[] = []
    const fastProvider: ISearchProvider<ProviderContext> = {
      id: 'provider-fast-terminal',
      name: 'Provider Fast Terminal',
      type: 'file',
      priority: 'fast',
      onSearch: async (inputQuery) => buildResult(inputQuery, 'terminal-result')
    }

    const gather = createGatherAggregator({
      fastLayerTimeoutMs: 100,
      fastLayerConcurrency: 1,
      taskTimeoutMs: 500
    })
    const controller = gather([fastProvider], query, async (update) => {
      callbackOrder.push(update.cancelled ? 'cancelled' : 'normal')
      terminalStarted.resolve()
      await terminalRelease.promise
    })

    await terminalStarted.promise
    controller.abort()
    terminalRelease.resolve()

    await expect(controller.promise).resolves.toBe(1)
    expect(callbackOrder).toEqual(['normal'])
  })

  it('keeps the controller pending until an empty-search terminal callback settles', async () => {
    const query: TuffQuery = { text: 'no providers', inputs: [] }
    const terminalRelease = createDeferred()
    let terminalStarted = false
    let controllerSettled = false

    const gather = createGatherAggregator()
    const controller = gather([], query, async (update) => {
      expect(update.isDone).toBe(true)
      terminalStarted = true
      await terminalRelease.promise
    })
    void controller.promise.then(() => {
      controllerSettled = true
    })

    await vi.waitFor(() => expect(terminalStarted).toBe(true))
    await wait(0)
    const settledBeforeRelease = controllerSettled

    terminalRelease.resolve()

    await expect(controller.promise).resolves.toBe(0)
    expect(settledBeforeRelease).toBe(false)
  })

  it('skips queued result callbacks and delivers one cancellation terminal', async () => {
    const query: TuffQuery = { text: 'cancel queued updates', inputs: [] }
    const firstCallbackStarted = createDeferred()
    const firstCallbackRelease = createDeferred()
    const otherProvidersRelease = createDeferred()
    const callbackOrder: string[] = []
    let otherProvidersCompleted = 0

    const providers: ISearchProvider<ProviderContext>[] = [
      {
        id: 'provider-first',
        name: 'Provider First',
        type: 'file',
        priority: 'deferred',
        onSearch: async (inputQuery) => buildResult(inputQuery, 'first-result')
      },
      ...['second-result', 'third-result'].map(
        (id): ISearchProvider<ProviderContext> => ({
          id: `provider-${id}`,
          name: `Provider ${id}`,
          type: 'file',
          priority: 'deferred',
          onSearch: async (inputQuery) => {
            await otherProvidersRelease.promise
            otherProvidersCompleted++
            return buildResult(inputQuery, id)
          }
        })
      )
    ]

    const gather = createGatherAggregator({
      deferredLayerDelayMs: 0,
      deferredLayerConcurrency: 3,
      taskTimeoutMs: 500
    })

    const controller = gather(providers, query, async (update) => {
      if (update.isDone) {
        callbackOrder.push(update.cancelled ? 'cancelled' : 'final')
        return
      }

      const id = update.newResults[0]?.items[0]?.id ?? 'empty'
      callbackOrder.push(id)
      if (id === 'first-result') {
        firstCallbackStarted.resolve()
        await firstCallbackRelease.promise
      }
    })

    await firstCallbackStarted.promise
    otherProvidersRelease.resolve()
    await vi.waitFor(() => expect(otherProvidersCompleted).toBe(2))
    await wait(0)

    controller.abort()
    const settledBeforeRelease = await Promise.race([
      controller.promise.then(() => true),
      wait(10).then(() => false)
    ])

    firstCallbackRelease.resolve()

    await expect(controller.promise).resolves.toBe(0)
    expect(settledBeforeRelease).toBe(false)
    expect(callbackOrder).toEqual(['first-result', 'cancelled'])
  })

  it('settles cancellation before an abort-insensitive provider returns', async () => {
    const query: TuffQuery = { text: 'cancel slow provider', inputs: [] }
    const providerStarted = createDeferred()
    const providerRelease = createDeferred()
    const callbackOrder: string[] = []
    const slowProvider: ISearchProvider<ProviderContext> = {
      id: 'provider-abort-insensitive',
      name: 'Provider Abort Insensitive',
      type: 'file',
      priority: 'deferred',
      onSearch: async (inputQuery) => {
        providerStarted.resolve()
        await providerRelease.promise
        return buildResult(inputQuery, 'ignored-abort-result')
      }
    }

    const gather = createGatherAggregator({
      deferredLayerDelayMs: 0,
      deferredLayerConcurrency: 1,
      taskTimeoutMs: 500
    })
    const controller = gather([slowProvider], query, (update) => {
      callbackOrder.push(update.cancelled ? 'cancelled' : update.isDone ? 'final' : 'result')
    })

    await providerStarted.promise
    controller.abort()

    await expect(controller.promise).resolves.toBe(0)
    expect(callbackOrder).toEqual(['cancelled'])

    providerRelease.resolve()
    await wait(0)

    expect(callbackOrder).toEqual(['cancelled'])
  })

  it('rejects with the original callback error and aborts remaining providers', async () => {
    const query: TuffQuery = { text: 'callback failure', inputs: [] }
    const callbackError = new Error('consumer failed')
    let slowProviderAborted = false
    const observedUpdates: string[] = []

    const failingResultProvider: ISearchProvider<ProviderContext> = {
      id: 'provider-result',
      name: 'Provider Result',
      type: 'file',
      priority: 'deferred',
      onSearch: async (inputQuery) => buildResult(inputQuery, 'failing-result')
    }
    const slowProvider: ISearchProvider<ProviderContext> = {
      id: 'provider-slow',
      name: 'Provider Slow',
      type: 'file',
      priority: 'deferred',
      onSearch: async (inputQuery, signal) =>
        new Promise<TuffSearchResult>((resolve, reject) => {
          const timeout = setTimeout(() => resolve(buildResult(inputQuery, 'slow-result')), 100)
          signal.addEventListener(
            'abort',
            () => {
              slowProviderAborted = true
              clearTimeout(timeout)
              reject(new Error('provider aborted'))
            },
            { once: true }
          )
        })
    }

    const gather = createGatherAggregator({
      deferredLayerDelayMs: 0,
      deferredLayerConcurrency: 2,
      taskTimeoutMs: 500
    })

    const controller = gather([failingResultProvider, slowProvider], query, async (update) => {
      observedUpdates.push(update.cancelled ? 'cancelled' : update.isDone ? 'final' : 'result')
      if (!update.isDone) {
        throw callbackError
      }
    })

    await expect(controller.promise).rejects.toBe(callbackError)
    await wait(0)

    expect(slowProviderAborted).toBe(true)
    expect(observedUpdates).toEqual(['result'])
  })

  it('keeps provider execution concurrent while consumers apply backpressure', async () => {
    const query: TuffQuery = { text: 'provider concurrency', inputs: [] }
    const providersRelease = createDeferred()
    const firstWorkerPairStarted = createDeferred()
    let activeProviders = 0
    let maxActiveProviders = 0
    let startedProviders = 0

    const providers = ['one', 'two', 'three'].map(
      (id): ISearchProvider<ProviderContext> => ({
        id: `provider-${id}`,
        name: `Provider ${id}`,
        type: 'file',
        priority: 'deferred',
        onSearch: async (inputQuery) => {
          activeProviders++
          startedProviders++
          maxActiveProviders = Math.max(maxActiveProviders, activeProviders)
          if (startedProviders === 2) {
            firstWorkerPairStarted.resolve()
          }
          await providersRelease.promise
          activeProviders--
          return buildResult(inputQuery, `result-${id}`)
        }
      })
    )

    const gather = createGatherAggregator({
      deferredLayerDelayMs: 0,
      deferredLayerConcurrency: 2,
      taskTimeoutMs: 500
    })
    const controller = gather(providers, query, () => {})

    await firstWorkerPairStarted.promise
    expect(startedProviders).toBe(2)
    expect(maxActiveProviders).toBe(2)

    providersRelease.resolve()

    await expect(controller.promise).resolves.toBe(3)
    expect(startedProviders).toBe(3)
    expect(maxActiveProviders).toBe(2)
  })
})
