import { afterEach, describe, expect, it, vi } from 'vitest'
import { SearchIndexService } from './search-index-service'

type SearchIndexHarness = Omit<SearchIndexService, 'recordOperationLog'> & {
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

  it('reports a zero-result FTS search without counting rows on the same hot path', async () => {
    const all = vi.fn(async () => [] as Array<Record<string, unknown>>)
    const service = new SearchIndexService({ all } as unknown as ConstructorParameters<
      typeof SearchIndexService
    >[0]) as unknown as SearchIndexHarness & { initialized: boolean }
    service.initialized = true
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    await expect(service.search('file-provider', 'report')).resolves.toEqual([])

    // One read for the search itself. The diagnostic used to add a COUNT over the FTS table,
    // which is the cost the zero-result path was supposed to avoid.
    expect(all).toHaveBeenCalledTimes(1)
    const warned = warnSpy.mock.calls.map((call) => JSON.stringify(call)).join('\n')
    expect(warned).toContain('FTS search returned zero results')
    expect(warned).toContain('file-provider')
    expect(warned).not.toContain('totalRows')
  })
})
