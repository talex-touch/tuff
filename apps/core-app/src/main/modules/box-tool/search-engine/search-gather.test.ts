import type { ISearchProvider, TuffQuery, TuffSearchResult } from '@talex-touch/utils'
import type { ProviderContext } from './types'
import { TuffSearchResultBuilder } from '@talex-touch/utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createGatherAggregator } from './search-gather'

const analyticsModuleMock = vi.hoisted(() => ({
  recordSearchMetrics: vi.fn()
}))

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
