import type { ISearchProvider, TuffQuery, TuffSearchResult } from '@talex-touch/utils'
import type { ProviderContext } from './types'
import { TuffSearchResultBuilder } from '@talex-touch/utils'
import { describe, expect, it, vi } from 'vitest'
import { createGatherAggregator } from './search-gather'

vi.mock('../../analytics', () => ({
  analyticsModule: {
    recordSearchMetrics: vi.fn()
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
  it('should emit late fast results and keep final total count correct', async () => {
    const query: TuffQuery = { text: 'report', inputs: [] }
    const updates: Array<{ newResults: TuffSearchResult[]; totalCount: number; isDone: boolean }> =
      []

    const slowFastProvider: ISearchProvider<ProviderContext> = {
      id: 'provider-fast',
      name: 'Provider Fast',
      type: 'file',
      priority: 'fast',
      onSearch: async (inputQuery) => {
        await wait(80)
        return buildResult(inputQuery, 'late-file')
      }
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
})
