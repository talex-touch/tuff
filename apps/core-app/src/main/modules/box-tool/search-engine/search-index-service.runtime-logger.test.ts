import { describe, expect, it, vi } from 'vitest'

vi.mock('./search-logger', () => {
  throw new Error('search-logger should not be loaded by SearchIndexService')
})

import { SearchIndexService } from './search-index-service'

type SearchIndexHarness = SearchIndexService & { initialized: boolean }

describe('SearchIndexService runtime logger', () => {
  it('uses noop logger by default and does not load search-logger implicitly', async () => {
    const db = {
      all: vi.fn(async () => [])
    }
    const service = new SearchIndexService(
      db as ConstructorParameters<typeof SearchIndexService>[0]
    ) as unknown as SearchIndexHarness
    service.initialized = true

    await service.search('file-provider', 'demo', 10)

    expect(db.all).toHaveBeenCalled()
  })

  it('uses the injected runtime logger for main-thread search diagnostics', async () => {
    const db = {
      all: vi.fn(async () => [{ item_id: 'file:/tmp/demo.txt', score: -1 }])
    }
    const logger = {
      logSearchPhase: vi.fn(),
      indexSearchStart: vi.fn(),
      indexSearchEmpty: vi.fn(),
      indexSearchExecuting: vi.fn(),
      indexSearchComplete: vi.fn()
    }
    const service = new SearchIndexService(
      db as ConstructorParameters<typeof SearchIndexService>[0],
      { logger }
    ) as unknown as SearchIndexHarness
    service.initialized = true

    const results = await service.search('file-provider', 'demo', 10)

    expect(results).toEqual([{ itemId: 'file:/tmp/demo.txt', score: -1 }])
    expect(logger.logSearchPhase).toHaveBeenCalledWith(
      'FTS Search',
      'Provider: file-provider, Query: "demo"'
    )
    expect(logger.indexSearchStart).toHaveBeenCalledWith('file-provider', 'demo', 10)
    expect(logger.indexSearchExecuting).toHaveBeenCalled()
    expect(logger.indexSearchComplete).toHaveBeenCalledWith(1, expect.any(Number))
  })
})
