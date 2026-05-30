import { describe, expect, it, vi } from 'vitest'
import {
  IndexedSourceIntegrityService,
  IndexedSourceResetReasons
} from '../../search'

function createService(options: {
  resetRuntimeState?: () => Promise<{
    sourceId: string
    reason: typeof IndexedSourceResetReasons.IntegrityRepair
    clearedSearchIndex: boolean
    clearedScanProgress: boolean
    scanProgressRows: number
    startedAt: number
    completedAt: number
  }>
  cleanupOrphanedRecords?: () => Promise<number>
  nowValues?: number[]
} = {}) {
  const resetRuntimeState = vi.fn(
    options.resetRuntimeState ??
      (async () => ({
        sourceId: 'test-source',
        reason: IndexedSourceResetReasons.IntegrityRepair,
        clearedSearchIndex: true,
        clearedScanProgress: true,
        scanProgressRows: 4,
        startedAt: 100,
        completedAt: 120
      }))
  )
  const cleanupOrphanedRecords = vi.fn(options.cleanupOrphanedRecords ?? (async () => 0))
  const nowValues = options.nowValues ?? [100, 150]
  const now = vi.fn(() => nowValues.shift() ?? 150)

  return {
    cleanupOrphanedRecords,
    resetRuntimeState,
    service: new IndexedSourceIntegrityService({
      resetRuntimeState,
      cleanupOrphanedRecords,
      now
    })
  }
}

describe('IndexedSourceIntegrityService', () => {
  it('requests a progress-only reset when indexed rows are missing', async () => {
    const { cleanupOrphanedRecords, resetRuntimeState, service } = createService()

    const snapshot = await service.check({
      sourceId: 'test-source',
      indexedRows: 0,
      sourceRows: 10,
      resetReason: IndexedSourceResetReasons.IntegrityRepair
    })

    expect(resetRuntimeState).toHaveBeenCalledWith({
      reason: IndexedSourceResetReasons.IntegrityRepair,
      clearSearchIndex: false,
      clearScanProgress: true
    })
    expect(cleanupOrphanedRecords).not.toHaveBeenCalled()
    expect(snapshot).toMatchObject({
      sourceId: 'test-source',
      indexedRows: 0,
      sourceRows: 10,
      needsRebuild: true,
      clearedSearchIndex: true,
      clearedScanProgress: true,
      resetReason: IndexedSourceResetReasons.IntegrityRepair,
      resetScanProgressRows: 4,
      durationMs: 50
    })
  })

  it('also clears indexed rows when a stale partial index exists', async () => {
    const { resetRuntimeState, service } = createService()

    await service.check({
      sourceId: 'test-source',
      indexedRows: 5,
      sourceRows: 10,
      resetReason: IndexedSourceResetReasons.IntegrityRepair
    })

    expect(resetRuntimeState).toHaveBeenCalledWith({
      reason: IndexedSourceResetReasons.IntegrityRepair,
      clearSearchIndex: true,
      clearScanProgress: true
    })
  })

  it('cleans orphaned records when row counts are aligned', async () => {
    const { cleanupOrphanedRecords, resetRuntimeState, service } = createService({
      cleanupOrphanedRecords: async () => 3
    })

    const snapshot = await service.check({
      sourceId: 'test-source',
      indexedRows: 10,
      sourceRows: 10,
      resetReason: IndexedSourceResetReasons.IntegrityRepair
    })

    expect(resetRuntimeState).not.toHaveBeenCalled()
    expect(cleanupOrphanedRecords).toHaveBeenCalledTimes(1)
    expect(snapshot).toMatchObject({
      needsRebuild: false,
      orphanedRecordsRemoved: 3,
      clearedSearchIndex: false,
      clearedScanProgress: false,
      resetReason: null,
      resetScanProgressRows: 0
    })
  })

  it('normalizes invalid row counts and ratio input', async () => {
    const { resetRuntimeState, service } = createService()

    const snapshot = await service.check({
      sourceId: 'test-source',
      indexedRows: Number.NaN,
      sourceRows: -1,
      resetReason: IndexedSourceResetReasons.IntegrityRepair,
      minIndexedRowRatio: 2
    })

    expect(resetRuntimeState).not.toHaveBeenCalled()
    expect(snapshot).toMatchObject({
      indexedRows: 0,
      sourceRows: 0,
      needsRebuild: false
    })
  })
})
