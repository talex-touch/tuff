import { afterEach, describe, expect, it, vi } from 'vitest'
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
  const where = vi.fn(async (condition: unknown) => {
    const scopedPaths = extractInArrayValues(condition)
    if (scopedPaths.size === 0) {
      return rows
    }
    return rows.filter((row) => scopedPaths.has(row.path))
  })
  const query = {
    where,
    then: (resolve: (rows: Array<{ path: string; lastScanned?: unknown }>) => unknown) =>
      Promise.resolve(rows).then(resolve)
  }
  const from = vi.fn(() => query)
  const select = vi.fn(() => ({ from, where }))

  return {
    dbUtils: {
      getDb: vi.fn(() => ({ select }))
    },
    from,
    select,
    where
  }
}

function extractInArrayValues(condition: unknown): Set<string> {
  const queryChunks =
    (condition as { queryChunks?: unknown[] } | null | undefined)?.queryChunks ?? []
  const valueChunks = queryChunks.find(Array.isArray) as Array<{ value?: unknown }> | undefined

  return new Set(
    (valueChunks ?? [])
      .map((chunk) => chunk.value)
      .filter((value): value is string => typeof value === 'string')
  )
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
  const upsertScanProgress = vi.fn(async (paths: string[]) => paths.length)

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
  afterEach(() => {
    vi.restoreAllMocks()
  })

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

  it('scopes scan progress reads to current raw and normalized watch roots', async () => {
    const scopedTimestamp = Date.parse('2026-05-30T00:00:00.000Z')
    const { dbUtils, where } = createDbUtils([
      { path: '/users/me/documents', lastScanned: new Date(scopedTimestamp) }
    ])
    const { service } = createService({
      dbUtils,
      normalizePath: (path) => path.toLowerCase()
    })

    const summary = await service.getSummary(['/Users/me/Documents'])

    expect(where).toHaveBeenCalledWith(
      inArray(scanProgress.path, ['/Users/me/Documents', '/users/me/documents'])
    )
    expect(summary).toEqual({
      totalRoots: 1,
      pendingRoots: 0,
      completedRoots: 1,
      lastScannedAt: scopedTimestamp
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

  it('ignores empty normalized watch roots before reporting progress evidence', async () => {
    const scopedTimestamp = Date.parse('2026-05-30T00:00:00.000Z')
    const { dbUtils } = createDbUtils([
      { path: '/users/me/documents', lastScanned: new Date(scopedTimestamp) },
      { path: '', lastScanned: new Date('2026-05-31T00:00:00.000Z') }
    ])
    const { service } = createService({
      dbUtils,
      normalizePath: (path) => path.trim().toLowerCase()
    })

    const evidence = await service.buildEvidence({
      sourceId: 'file-provider',
      watchPaths: ['/Users/me/Documents', '   '],
      pendingPermissionPaths: ['   '],
      stats: READY_STATS,
      isIndexingActive: false
    })

    expect(evidence).toMatchObject({
      status: 'ready',
      reason: 'file-index-progress-ready',
      rootCount: 1,
      roots: ['/Users/me/Documents'],
      metadata: {
        totalRoots: 1,
        pendingRoots: 0,
        pendingPermissionRoots: 0,
        pendingPermissionPaths: [],
        configuredRoots: 1,
        completedRoots: 1,
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

  it('deletes both raw and normalized scan progress paths', async () => {
    const { db, where } = createDb()
    const { service } = createService({
      normalizePath: (path) => path.toLowerCase()
    })

    await service.deletePaths(db as never, ['/Users/me/Documents'])

    expect(where).toHaveBeenCalledWith(
      inArray(scanProgress.path, ['/Users/me/Documents', '/users/me/documents'])
    )
  })

  it('skips empty raw and normalized scan progress paths during delete', async () => {
    const { db, where } = createDb()
    const { service } = createService({
      normalizePath: (path) => path.trim().toLowerCase()
    })

    await service.deletePaths(db as never, ['   ', '/Users/me/Documents'])

    expect(where).toHaveBeenCalledWith(
      inArray(scanProgress.path, ['/Users/me/Documents', '/users/me/documents'])
    )
  })

  it('upserts completed paths through the search index worker when ready', async () => {
    const { service, ensureSearchIndexWorkerReady, upsertScanProgress } = createService()

    await expect(
      service.upsertCompletedPaths(['/a'], '2026-05-30T00:00:00.000Z', 'scan-progress.upsert')
    ).resolves.toEqual({
      attempted: true,
      ready: true,
      upserted: 1
    })

    expect(ensureSearchIndexWorkerReady).toHaveBeenCalledWith('scan-progress.upsert')
    expect(upsertScanProgress).toHaveBeenCalledWith(['/a'], '2026-05-30T00:00:00.000Z')
  })

  it('exposes the latest scan progress upsert summary in evidence metadata', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000)
    const { dbUtils } = createDbUtils([
      { path: '/users/me/documents', lastScanned: new Date('2026-05-30T00:00:00.000Z') }
    ])
    const { service } = createService({
      dbUtils,
      normalizePath: (path) => path.toLowerCase()
    })

    await service.upsertCompletedPaths(
      ['/Users/me/Documents', '/users/me/documents'],
      '2026-05-30T00:00:00.000Z',
      'scan-progress.upsert'
    )
    const evidence = await service.buildEvidence({
      sourceId: 'file-provider',
      watchPaths: ['/Users/me/Documents'],
      stats: READY_STATS,
      isIndexingActive: false
    })

    expect(evidence.metadata).toMatchObject({
      lastUpsertAttempted: true,
      lastUpsertReady: true,
      lastUpsertedRows: 1,
      lastUpsertReason: 'scan-progress.upsert',
      lastUpsertCheckedAt: 1_700_000_000_000
    })
    expect(evidence.metadata).not.toHaveProperty('lastUpsertPaths')
  })

  it('upserts normalized scan progress paths through the search index worker', async () => {
    const { service, upsertScanProgress } = createService({
      normalizePath: (path) => path.toLowerCase()
    })

    await expect(
      service.upsertCompletedPaths(
        ['/Users/me/Documents', '/users/me/documents'],
        '2026-05-30T00:00:00.000Z',
        'scan-progress.upsert'
      )
    ).resolves.toMatchObject({
      upserted: 1
    })

    expect(upsertScanProgress).toHaveBeenCalledWith(
      ['/users/me/documents'],
      '2026-05-30T00:00:00.000Z'
    )
  })

  it('skips empty normalized scan progress paths during upsert', async () => {
    const { service, upsertScanProgress } = createService({
      normalizePath: (path) => path.trim().toLowerCase()
    })

    await expect(
      service.upsertCompletedPaths(
        ['   ', '/Users/me/Documents'],
        '2026-05-30T00:00:00.000Z',
        'scan-progress.upsert'
      )
    ).resolves.toMatchObject({
      upserted: 1
    })

    expect(upsertScanProgress).toHaveBeenCalledWith(
      ['/users/me/documents'],
      '2026-05-30T00:00:00.000Z'
    )
  })

  it('skips completed path upsert when the worker is not ready', async () => {
    const { service, upsertScanProgress } = createService({
      ensureSearchIndexWorkerReady: async () => false
    })

    await expect(
      service.upsertCompletedPaths(['/a'], '2026-05-30T00:00:00.000Z', 'scan-progress.upsert')
    ).resolves.toEqual({
      attempted: true,
      ready: false,
      upserted: 0
    })

    expect(upsertScanProgress).not.toHaveBeenCalled()
  })

  it('keeps skipped scan progress upsert attempts visible in evidence metadata', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_001)
    const { service } = createService({
      ensureSearchIndexWorkerReady: async () => false
    })

    await service.upsertCompletedPaths(['/a'], '2026-05-30T00:00:00.000Z', 'scan-progress.upsert')
    const evidence = await service.buildEvidence({
      sourceId: 'file-provider',
      watchPaths: ['/a'],
      stats: READY_STATS,
      isIndexingActive: false
    })

    expect(evidence.metadata).toMatchObject({
      lastUpsertAttempted: true,
      lastUpsertReady: false,
      lastUpsertedRows: 0,
      lastUpsertReason: 'scan-progress.upsert',
      lastUpsertCheckedAt: 1_700_000_000_001
    })
  })
})
