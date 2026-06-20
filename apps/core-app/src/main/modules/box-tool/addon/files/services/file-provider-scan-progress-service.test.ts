import { describe, expect, it, vi } from 'vitest'
import { inArray } from 'drizzle-orm'
import { scanProgress } from '../../../../../db/schema'
import {
  FileProviderScanProgressService,
  type FileProviderIndexStatsForEvidence
} from './file-provider-scan-progress-service'

const READY_STATS: FileProviderIndexStatsForEvidence = {
  totalFiles: 4,
  failedFiles: 0,
  skippedFiles: 1,
  completedFiles: 3,
  embeddingCompletedFiles: 2,
  embeddingRows: 2
}

function createDbUtils(rows: Array<{ path: string; lastScanned?: unknown }>) {
  const from = vi.fn(async () => rows)
  const select = vi.fn(() => ({ from }))

  return {
    dbUtils: {
      getDb: vi.fn(() => ({ select }))
    },
    from,
    select
  }
}

function createDb() {
  const where = vi.fn(async () => undefined)
  const deleteFrom = vi.fn(() => ({ where }))
  return {
    db: {
      delete: deleteFrom
    },
    deleteFrom,
    where
  }
}

function createService(
  input: {
    dbUtils?: unknown
    normalizePath?: (path: string) => string
    ensureSearchIndexWorkerReady?: (reason: string) => Promise<boolean>
  } = {}
) {
  const ensureSearchIndexWorkerReady = vi.fn(
    input.ensureSearchIndexWorkerReady ?? (async () => true)
  )
  const upsertScanProgress = vi.fn(async () => undefined)

  return {
    ensureSearchIndexWorkerReady,
    service: new FileProviderScanProgressService({
      getDbUtils: () => (input.dbUtils ?? null) as never,
      normalizePath: input.normalizePath,
      ensureSearchIndexWorkerReady,
      getSearchIndexWorker: () => ({ upsertScanProgress })
    }),
    upsertScanProgress
  }
}

describe('file-provider-scan-progress-service', () => {
  it('marks all roots pending when database utils are unavailable', async () => {
    const { service } = createService()

    await expect(service.getSummary(['/a', '/b'])).resolves.toEqual({
      totalRoots: 0,
      pendingRoots: 2,
      completedRoots: 0,
      lastScannedAt: null
    })
  })

  it('reads completed scan roots from the scan progress table', async () => {
    const scannedAt = new Date('2026-05-30T00:00:00.000Z')
    const { dbUtils, from } = createDbUtils([{ path: '/a', lastScanned: scannedAt }])
    const { service } = createService({ dbUtils })

    const summary = await service.getSummary(['/a', '/b'])

    expect(from).toHaveBeenCalledWith(scanProgress)
    expect(summary).toEqual({
      totalRoots: 1,
      pendingRoots: 1,
      completedRoots: 1,
      lastScannedAt: scannedAt.getTime()
    })
  })

  it('ignores scan progress rows outside current watch roots', async () => {
    const ignoredTimestamp = Date.parse('2026-05-31T00:00:00.000Z')
    const scopedTimestamp = Date.parse('2026-05-30T00:00:00.000Z')
    const { dbUtils } = createDbUtils([
      { path: '/a', lastScanned: new Date(scopedTimestamp) },
      { path: '/other-source', lastScanned: new Date(ignoredTimestamp) }
    ])
    const { service } = createService({ dbUtils })

    const evidence = await service.buildEvidence({
      sourceId: 'file-provider',
      watchPaths: ['/a', '/b'],
      stats: READY_STATS,
      isIndexingActive: false
    })

    expect(evidence).toMatchObject({
      status: 'warming',
      metadata: {
        totalRoots: 1,
        pendingRoots: 1,
        completedRoots: 1,
        scanProgressRows: 1,
        lastScannedAt: scopedTimestamp
      }
    })
  })

  it('matches scan progress rows through the injected normalizer', async () => {
    const scopedTimestamp = Date.parse('2026-05-30T00:00:00.000Z')
    const ignoredTimestamp = Date.parse('2026-05-31T00:00:00.000Z')
    const { dbUtils } = createDbUtils([
      { path: '/users/me/documents', lastScanned: new Date(scopedTimestamp) },
      { path: '/other-source', lastScanned: new Date(ignoredTimestamp) }
    ])
    const { service } = createService({
      dbUtils,
      normalizePath: (path) => path.toLowerCase()
    })

    const evidence = await service.buildEvidence({
      sourceId: 'file-provider',
      watchPaths: ['/Users/me/Documents'],
      stats: READY_STATS,
      isIndexingActive: false
    })

    expect(evidence).toMatchObject({
      status: 'ready',
      reason: 'file-index-progress-ready',
      metadata: {
        totalRoots: 1,
        pendingRoots: 0,
        completedRoots: 1,
        scanProgressRows: 1,
        lastScannedAt: scopedTimestamp
      }
    })
  })

  it('deduplicates normalized watch roots before reporting progress summary', async () => {
    const scopedTimestamp = Date.parse('2026-05-30T00:00:00.000Z')
    const { dbUtils } = createDbUtils([
      { path: '/users/me/documents', lastScanned: new Date(scopedTimestamp) }
    ])
    const { service } = createService({
      dbUtils,
      normalizePath: (path) => path.toLowerCase()
    })

    const evidence = await service.buildEvidence({
      sourceId: 'file-provider',
      watchPaths: ['/Users/me/Documents', '/users/me/documents'],
      stats: READY_STATS,
      isIndexingActive: false
    })

    expect(evidence).toMatchObject({
      status: 'ready',
      reason: 'file-index-progress-ready',
      metadata: {
        totalRoots: 1,
        pendingRoots: 0,
        completedRoots: 1,
        configuredRoots: 2,
        scanProgressRows: 1,
        lastScannedAt: scopedTimestamp
      }
    })
  })

  it('uses the latest completed root timestamp for progress evidence', async () => {
    const staleTimestamp = Date.parse('2026-05-29T00:00:00.000Z')
    const freshTimestamp = Date.parse('2026-05-30T00:00:00.000Z')
    const { dbUtils } = createDbUtils([
      { path: '/a', lastScanned: staleTimestamp },
      { path: '/b', lastScanned: new Date(freshTimestamp) }
    ])
    const { service } = createService({ dbUtils })

    const evidence = await service.buildEvidence({
      sourceId: 'file-provider',
      watchPaths: ['/a', '/b'],
      stats: READY_STATS,
      isIndexingActive: false
    })

    expect(evidence).toMatchObject({
      status: 'ready',
      reason: 'file-index-progress-ready',
      metadata: {
        completedRoots: 2,
        scanProgressRows: 2,
        lastScannedAt: freshTimestamp
      }
    })
  })

  it('builds warming evidence when roots are still pending', async () => {
    const { dbUtils } = createDbUtils([{ path: '/a' }])
    const { service } = createService({ dbUtils })

    const evidence = await service.buildEvidence({
      sourceId: 'file-provider',
      watchPaths: ['/a', '/b'],
      stats: READY_STATS,
      isIndexingActive: false,
      checkedAt: 123
    })

    expect(evidence).toMatchObject({
      id: 'file-provider:scan-progress',
      status: 'warming',
      reason: 'file-index-progress-has-pending-roots',
      itemCount: 3,
      rootCount: 2,
      roots: ['/a', '/b'],
      lastCheckedAt: 123,
      metadata: {
        totalRoots: 1,
        pendingRoots: 1,
        configuredRoots: 2,
        completedRoots: 1,
        scanProgressRows: 1,
        lastScannedAt: null,
        totalFiles: 4,
        completedFiles: 3
      }
    })
  })

  it('builds permission-required evidence when watch roots are pending permission', async () => {
    const { dbUtils } = createDbUtils([{ path: '/a' }])
    const { service } = createService({ dbUtils })

    const evidence = await service.buildEvidence({
      sourceId: 'file-provider',
      watchPaths: ['/a', '/b'],
      pendingPermissionPaths: ['/b'],
      stats: READY_STATS,
      isIndexingActive: false
    })

    expect(evidence).toMatchObject({
      status: 'permission-required',
      reason: 'file-index-watch-root-pending-permission',
      metadata: {
        pendingPermissionRoots: 1,
        pendingPermissionPaths: ['/b']
      }
    })
  })

  it('builds degraded evidence when failed files exist', async () => {
    const { dbUtils } = createDbUtils([{ path: '/a' }])
    const { service } = createService({ dbUtils })

    const evidence = await service.buildEvidence({
      sourceId: 'file-provider',
      watchPaths: ['/a'],
      stats: {
        ...READY_STATS,
        failedFiles: 2
      },
      isIndexingActive: false
    })

    expect(evidence.status).toBe('degraded')
    expect(evidence.reason).toBe('file-index-progress-has-failed-files')
  })

  it('builds running evidence when indexing is active after roots are complete', async () => {
    const { dbUtils } = createDbUtils([{ path: '/a' }])
    const { service } = createService({ dbUtils })

    const evidence = await service.buildEvidence({
      sourceId: 'file-provider',
      watchPaths: ['/a'],
      stats: READY_STATS,
      isIndexingActive: true
    })

    expect(evidence.status).toBe('warming')
    expect(evidence.reason).toBe('file-index-progress-running')
  })

  it('keeps configured root evidence explicit when the progress store is unavailable', async () => {
    const { service } = createService()

    const evidence = await service.buildEvidence({
      sourceId: 'file-provider',
      watchPaths: ['/a', '/b'],
      stats: READY_STATS,
      isIndexingActive: false
    })

    expect(evidence).toMatchObject({
      status: 'warming',
      reason: 'file-index-progress-has-pending-roots',
      metadata: {
        totalRoots: 0,
        pendingRoots: 2,
        configuredRoots: 2,
        completedRoots: 0,
        scanProgressRows: 0,
        lastScannedAt: null
      }
    })
  })

  it('deletes scan progress paths through the injected db transaction', async () => {
    const { db, deleteFrom, where } = createDb()
    const { service } = createService()

    await service.deletePaths(db as never, ['/a', '/b'])

    expect(deleteFrom).toHaveBeenCalledWith(scanProgress)
    expect(where).toHaveBeenCalledWith(inArray(scanProgress.path, ['/a', '/b']))
  })

  it('does not delete scan progress when no paths are provided', async () => {
    const { db, deleteFrom } = createDb()
    const { service } = createService()

    await service.deletePaths(db as never, [])

    expect(deleteFrom).not.toHaveBeenCalled()
  })

  it('upserts completed paths through the search index worker when ready', async () => {
    const { service, ensureSearchIndexWorkerReady, upsertScanProgress } = createService()

    await service.upsertCompletedPaths(['/a'], '2026-05-30T00:00:00.000Z', 'scan-progress.upsert')

    expect(ensureSearchIndexWorkerReady).toHaveBeenCalledWith('scan-progress.upsert')
    expect(upsertScanProgress).toHaveBeenCalledWith(['/a'], '2026-05-30T00:00:00.000Z')
  })

  it('skips completed path upsert when the worker is not ready', async () => {
    const { service, upsertScanProgress } = createService({
      ensureSearchIndexWorkerReady: async () => false
    })

    await service.upsertCompletedPaths(['/a'], '2026-05-30T00:00:00.000Z', 'scan-progress.upsert')

    expect(upsertScanProgress).not.toHaveBeenCalled()
  })
})
