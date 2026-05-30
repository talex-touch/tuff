import { describe, expect, it, vi } from 'vitest'
import { IndexedSourceResetExecutorService, IndexedSourceResetReasons } from '../../search'

function createExecutor(options: {
  clearSearchIndex?: (reason: string) => Promise<void>
  clearScanProgress?: (reason: string) => Promise<{ cleared: boolean; rows?: number }>
  nowValues?: number[]
} = {}) {
  const nowValues = options.nowValues ?? [100, 150]
  const clearSearchIndex = vi.fn(options.clearSearchIndex ?? (async () => undefined))
  const clearScanProgress = vi.fn(
    options.clearScanProgress ?? (async () => ({ cleared: true, rows: 3 }))
  )
  const now = vi.fn(() => nowValues.shift() ?? 150)

  return {
    clearScanProgress,
    clearSearchIndex,
    executor: new IndexedSourceResetExecutorService({
      sourceId: 'test-source',
      clearSearchIndex,
      clearScanProgress,
      now
    }),
    now
  }
}

describe('IndexedSourceResetExecutorService', () => {
  it('clears search index and scan progress when requested', async () => {
    const { clearSearchIndex, clearScanProgress, executor } = createExecutor()

    const result = await executor.reset({
      request: {
        sourceId: 'test-source',
        reason: IndexedSourceResetReasons.IntegrityRepair,
        clearSearchIndex: true,
        clearScanProgress: true
      },
      operationReasonPrefix: 'test.integrity'
    })

    expect(clearSearchIndex).toHaveBeenCalledWith('test.integrity.remove-by-provider')
    expect(clearScanProgress).toHaveBeenCalledWith('test.integrity.scan-progress-reset')
    expect(result).toEqual({
      sourceId: 'test-source',
      reason: IndexedSourceResetReasons.IntegrityRepair,
      clearedSearchIndex: true,
      clearedScanProgress: true,
      scanProgressRows: 3,
      startedAt: 100,
      completedAt: 150
    })
  })

  it('skips scan progress cleanup when request disables it', async () => {
    const { clearScanProgress, clearSearchIndex, executor } = createExecutor()

    const result = await executor.reset({
      request: {
        sourceId: 'test-source',
        reason: IndexedSourceResetReasons.SchemaMigration,
        clearScanProgress: false
      }
    })

    expect(clearSearchIndex).not.toHaveBeenCalled()
    expect(clearScanProgress).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      clearedSearchIndex: false,
      clearedScanProgress: false,
      scanProgressRows: 0
    })
  })

  it('uses explicit input overrides before request flags', async () => {
    const { clearSearchIndex, clearScanProgress, executor } = createExecutor({
      clearScanProgress: async () => ({ cleared: false, rows: 0 })
    })

    const result = await executor.reset({
      request: {
        sourceId: 'test-source',
        reason: IndexedSourceResetReasons.UserClear,
        clearSearchIndex: true,
        clearScanProgress: true
      },
      clearSearchIndex: false,
      clearScanProgress: true
    })

    expect(clearSearchIndex).not.toHaveBeenCalled()
    expect(clearScanProgress).toHaveBeenCalledTimes(1)
    expect(result).toMatchObject({
      clearedSearchIndex: false,
      clearedScanProgress: false,
      scanProgressRows: 0
    })
  })
})
