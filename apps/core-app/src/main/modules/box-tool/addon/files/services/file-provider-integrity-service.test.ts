import { describe, expect, it, vi } from 'vitest'
import { IndexedSourceResetReasons } from '@talex-touch/utils/search'
import { FileProviderIntegrityService } from './file-provider-integrity-service'

function createDb(options: { filesRows: number; orphanedKeywords?: number }) {
  const fileCountWhere = vi.fn(async () => [{ cnt: options.filesRows }])
  const fileCountFrom = vi.fn(() => ({ where: fileCountWhere }))
  const select = vi.fn(() => ({ from: fileCountFrom }))
  const all = vi.fn(async () => [{ cnt: options.orphanedKeywords ?? 0 }])
  const run = vi.fn(async () => undefined)

  return {
    all,
    db: {
      all,
      run,
      select
    },
    fileCountFrom,
    fileCountWhere,
    run,
    select
  }
}

function createService(options: {
  ftsRows: number
  orphanedKeywords?: number
  resetRuntimeState?: FileProviderIntegrityServiceDepsForTest['resetRuntimeState']
}) {
  const countSearchIndexByProvider = vi.fn(async () => options.ftsRows)
  const resetRuntimeState = vi.fn(
    options.resetRuntimeState ??
      (async () => ({
        sourceId: 'file-provider',
        reason: IndexedSourceResetReasons.IntegrityRepair,
        clearedSearchIndex: true,
        clearedSearchIndexRows: 4,
        clearedScanProgress: true,
        scanProgressRows: 2,
        startedAt: 100,
        completedAt: 123
      }))
  )
  const logInfo = vi.fn()
  const cleanupSource = vi.fn().mockResolvedValue(options.orphanedKeywords ?? 0)

  return {
    countSearchIndexByProvider,
    logInfo,
    resetRuntimeState,
    service: new FileProviderIntegrityService({
      sourceId: 'file-provider',
      countSearchIndexByProvider,
      resetRuntimeState,
      logInfo,
      cleanupSource
    }),
    cleanupSource
  }
}

type FileProviderIntegrityServiceDepsForTest = ConstructorParameters<
  typeof FileProviderIntegrityService
>[0]

describe('file-provider-integrity-service', () => {
  it('requests runtime reset when FTS rows are missing for indexed files', async () => {
    const { db } = createDb({ filesRows: 10 })
    const { resetRuntimeState, service } = createService({ ftsRows: 0 })

    const snapshot = await service.check(db as never)

    expect(resetRuntimeState).toHaveBeenCalledWith({
      reason: IndexedSourceResetReasons.IntegrityRepair,
      clearSearchIndex: false,
      clearScanProgress: true
    })
    expect(snapshot).toMatchObject({
      ftsRows: 0,
      filesRows: 10,
      needsRebuild: true,
      clearedSearchIndex: true,
      resetSearchIndexRows: 4,
      clearedScanProgress: true,
      resetReason: IndexedSourceResetReasons.IntegrityRepair,
      resetScanProgressRows: 2
    })
  })

  it('requests search-index cleanup when stale FTS rows exist during reset', async () => {
    const { db } = createDb({ filesRows: 10 })
    const { resetRuntimeState, service } = createService({ ftsRows: 5 })

    await service.check(db as never)

    expect(resetRuntimeState).toHaveBeenCalledWith({
      reason: IndexedSourceResetReasons.IntegrityRepair,
      clearSearchIndex: true,
      clearScanProgress: true
    })
  })

  it('removes orphaned keyword mappings when FTS and files rows are aligned', async () => {
    const { db } = createDb({ filesRows: 10, orphanedKeywords: 3 })
    const { resetRuntimeState, service, cleanupSource } = createService({
      ftsRows: 10,
      orphanedKeywords: 3
    })

    const snapshot = await service.check(db as never)

    expect(resetRuntimeState).not.toHaveBeenCalled()
    expect(cleanupSource).toHaveBeenCalledWith('file-provider', undefined)
    expect(snapshot).toMatchObject({
      ftsRows: 10,
      filesRows: 10,
      needsRebuild: false,
      orphanedKeywordsRemoved: 3
    })
  })

  it('cleans runtime search-index state and returns a ready snapshot when rows are aligned', async () => {
    const { db, run } = createDb({ filesRows: 10, orphanedKeywords: 0 })
    const { resetRuntimeState, service, cleanupSource } = createService({
      ftsRows: 10,
      orphanedKeywords: 0
    })

    const snapshot = await service.check(db as never)

    expect(resetRuntimeState).not.toHaveBeenCalled()
    expect(cleanupSource).toHaveBeenCalledWith('file-provider', undefined)
    expect(run).not.toHaveBeenCalled()
    expect(snapshot).toMatchObject({
      ftsRows: 10,
      filesRows: 10,
      needsRebuild: false,
      clearedSearchIndex: false,
      resetSearchIndexRows: 0,
      clearedScanProgress: false,
      orphanedKeywordsRemoved: 0,
      resetReason: null,
      resetScanProgressRows: 0
    })
  })
})
