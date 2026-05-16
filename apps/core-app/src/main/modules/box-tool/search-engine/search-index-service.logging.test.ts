import { afterEach, describe, expect, it, vi } from 'vitest'
import { SearchIndexService } from './search-index-service'

type SearchIndexHarness = SearchIndexService & {
  recordOperationLog: (
    action: 'index' | 'remove' | 'removeByProvider',
    items: number,
    durationMs: number
  ) => void
}

function createServiceHarness(): SearchIndexHarness {
  return new SearchIndexService(
    {} as ConstructorParameters<typeof SearchIndexService>[0]
  ) as unknown as SearchIndexHarness
}

describe('SearchIndexService logging throttle', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('高频记录会在窗口内聚合输出 summary', async () => {
    vi.useFakeTimers()
    const service = createServiceHarness()
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {})

    service.recordOperationLog('index', 2, 320)
    service.recordOperationLog('index', 3, 340)

    expect(debugSpy).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(12_000)

    expect(debugSpy).toHaveBeenCalledTimes(1)
    expect(String(debugSpy.mock.calls[0]?.[0] ?? '')).toContain('Indexed summary')
  })

  it('慢批次仍会即时输出', () => {
    const service = createServiceHarness()
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {})

    service.recordOperationLog('remove', 5, 1_900)

    expect(debugSpy).toHaveBeenCalledTimes(1)
    expect(String(debugSpy.mock.calls[0]?.[0] ?? '')).toContain('Removed slow batch')
  })
})
