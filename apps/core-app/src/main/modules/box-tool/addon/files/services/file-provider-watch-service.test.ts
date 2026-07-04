import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FileProviderWatchService } from './file-provider-watch-service'
import FileSystemWatcher from '../../../file-system-watcher'
import { appTaskGate } from '../../../../../service/app-task-gate'
import { deviceIdleService } from '../../../../../service/device-idle-service'
import { isSearchRecentlyActive } from '../../../search-engine/search-activity'

vi.mock('@talex-touch/utils', () => ({
  StorageList: {
    FILE_INDEX_SETTINGS: 'file-index-settings.json'
  }
}))

vi.mock('../../../file-system-watcher', () => ({
  default: {
    addPath: vi.fn(async () => undefined),
    getPendingPaths: vi.fn(() => [])
  }
}))

vi.mock('../../../../storage', () => ({
  getMainConfig: vi.fn(() => ({})),
  saveMainConfig: vi.fn()
}))

vi.mock('../../../../../service/app-task-gate', () => ({
  appTaskGate: {
    isActive: vi.fn(() => false)
  }
}))

vi.mock('../../../../../service/background-task-service', () => ({
  AppUsageActivityTracker: {
    getInstance: vi.fn(() => ({
      recordActivity: vi.fn()
    }))
  },
  BackgroundTaskService: {
    getInstance: vi.fn(() => ({
      registerTask: vi.fn(),
      on: vi.fn(),
      start: vi.fn(),
      recordActivity: vi.fn()
    }))
  }
}))

vi.mock('../../../../../service/device-idle-service', () => ({
  deviceIdleService: {
    canRun: vi.fn(async () => ({
      allowed: true,
      snapshot: { battery: null }
    }))
  }
}))

vi.mock('../../../../../service/failed-files-cleanup-task', () => ({
  createFailedFilesCleanupTask: vi.fn(() => ({
    id: 'file-index.failed-files-cleanup',
    name: 'Failed Files Cleanup',
    priority: 'low',
    execute: vi.fn()
  }))
}))

vi.mock('../../../search-engine/search-activity', () => ({
  isSearchRecentlyActive: vi.fn(() => false)
}))

function createDbUtils(
  rows: Array<{ path: string; lastScanned: unknown }>,
  options: { sourceScoped?: boolean } = {}
) {
  const all = vi.fn(async (query: unknown) => {
    const text = String(query)
    if (text.includes('PRAGMA table_info(scan_progress)')) {
      return options.sourceScoped
        ? [
            { name: 'source_id', pk: 1 },
            { name: 'path', pk: 2 },
            { name: 'last_scanned', pk: 0 }
          ]
        : [
            { name: 'path', pk: 1 },
            { name: 'last_scanned', pk: 0 }
          ]
    }

    const scopedPaths = extractSqlParamValues(query)
    if (scopedPaths.size === 0) {
      return rows
    }
    return rows.filter((row) => scopedPaths.has(row.path))
  })

  return {
    dbUtils: {
      getDb: vi.fn(() => ({ all }))
    },
    all
  }
}

function extractSqlParamValues(condition: unknown): Set<string> {
  const values: string[] = []
  const visit = (value: unknown) => {
    if (typeof value === 'string') {
      values.push(value)
      return
    }
    if (!value || typeof value !== 'object') return
    const record = value as { value?: unknown; queryChunks?: unknown[] }
    if (typeof record.value === 'string') {
      values.push(record.value)
    } else if (Array.isArray(record.value)) {
      record.value.filter((entry): entry is string => typeof entry === 'string').forEach(visit)
    }
    if (Array.isArray(record.queryChunks)) {
      for (const chunk of record.queryChunks) {
        if (Array.isArray(chunk)) {
          chunk.forEach(visit)
        } else {
          visit(chunk)
        }
      }
    }
  }
  visit(condition)

  return new Set(
    values.filter((value) => value !== 'file-provider').filter((value) => value.startsWith('/'))
  )
}

function createService(
  input: {
    baseWatchPaths?: string[]
    dbUtils?: unknown
    normalizePath?: (rawPath: string) => string
  } = {}
) {
  return new FileProviderWatchService({
    baseWatchPaths: input.baseWatchPaths ?? ['/tmp/tuff-index-a', '/tmp/tuff-index-b'],
    getDbUtils: () => (input.dbUtils ?? null) as never,
    getWatchDepthForPath: () => 1,
    normalizePath: input.normalizePath ?? ((rawPath) => rawPath),
    enqueueIncrementalUpdate: vi.fn(),
    runAutoIndexing: vi.fn(async () => undefined),
    logDebug: vi.fn(),
    logWarn: vi.fn(),
    logError: vi.fn()
  })
}

describe('file-provider-watch-service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns empty scan eligibility when database utils are unavailable', async () => {
    const service = createService()

    await expect(service.getScanEligibility()).resolves.toEqual({
      newPaths: [],
      stalePaths: [],
      lastScannedAt: null
    })
  })

  it('reads scan progress through the current watch root scope', async () => {
    const scannedAt = new Date()
    const { dbUtils, all } = createDbUtils([{ path: '/tmp/tuff-index-a', lastScanned: scannedAt }])
    const service = createService({ dbUtils })

    const eligibility = await service.getScanEligibility()

    expect(all).toHaveBeenCalledWith(expect.objectContaining({ queryChunks: expect.any(Array) }))
    expect(eligibility.newPaths).toEqual(['/tmp/tuff-index-b'])
    expect(eligibility.lastScannedAt).toBe(scannedAt.getTime())
  })

  it('reads source-scoped scan progress for the file provider source', async () => {
    const scannedAt = new Date()
    const { dbUtils, all } = createDbUtils(
      [{ path: '/tmp/tuff-index-a', lastScanned: scannedAt }],
      { sourceScoped: true }
    )
    const service = createService({ dbUtils })

    const eligibility = await service.getScanEligibility()

    expect(all).toHaveBeenCalledTimes(2)
    expect(eligibility.newPaths).toEqual(['/tmp/tuff-index-b'])
    expect(eligibility.lastScannedAt).toBe(scannedAt.getTime())
  })

  it('includes raw and normalized watch roots in the scan progress query', async () => {
    const scannedAt = new Date('2026-06-20T10:00:00.000Z')
    const { dbUtils, all } = createDbUtils([
      { path: '/users/me/documents', lastScanned: scannedAt }
    ])
    const service = createService({
      baseWatchPaths: ['/Users/me/Documents'],
      dbUtils,
      normalizePath: (rawPath) => rawPath.toLowerCase()
    })

    const eligibility = await service.getScanEligibility()

    expect(extractSqlParamValues(all.mock.calls[1]?.[0])).toEqual(
      new Set(['/Users/me/Documents', '/users/me/documents'])
    )
    expect(eligibility.newPaths).toEqual([])
    expect(eligibility.lastScannedAt).toBe(scannedAt.getTime())
  })

  it('skips watch roots rejected by the normalizer before reading scan progress', async () => {
    const scannedAt = new Date('2026-06-20T10:00:00.000Z')
    const { dbUtils, all } = createDbUtils([{ path: '/tmp/accepted', lastScanned: scannedAt }])
    const service = createService({
      baseWatchPaths: ['/tmp/rejected', '/tmp/accepted'],
      dbUtils,
      normalizePath: (rawPath) => (rawPath.includes('rejected') ? '' : rawPath)
    })

    const eligibility = await service.getScanEligibility()

    expect(extractSqlParamValues(all.mock.calls[1]?.[0])).toEqual(new Set(['/tmp/accepted']))
    expect(eligibility.newPaths).toEqual([])
    expect(eligibility.lastScannedAt).toBe(scannedAt.getTime())
  })

  it('marks stale paths when scan progress exceeds the auto scan interval', async () => {
    const staleTimestamp = Date.now() - 25 * 60 * 60 * 1000
    const freshTimestamp = Date.now()
    const { dbUtils } = createDbUtils([
      { path: '/tmp/tuff-index-a', lastScanned: staleTimestamp },
      { path: '/tmp/tuff-index-b', lastScanned: freshTimestamp }
    ])
    const service = createService({ dbUtils })

    const eligibility = await service.getScanEligibility()

    expect(eligibility.newPaths).toEqual([])
    expect(eligibility.stalePaths).toEqual(['/tmp/tuff-index-a'])
    expect(eligibility.lastScannedAt).toBe(freshTimestamp)
  })

  it('does not let scan progress outside watched roots affect last scanned time', async () => {
    const scopedTimestamp = Date.now() - 2 * 60 * 60 * 1000
    const externalTimestamp = Date.now()
    const { dbUtils } = createDbUtils([
      { path: '/tmp/tuff-index-a', lastScanned: scopedTimestamp },
      { path: '/external-index-root', lastScanned: externalTimestamp }
    ])
    const service = createService({ dbUtils })

    const eligibility = await service.getScanEligibility()

    expect(eligibility.newPaths).toEqual(['/tmp/tuff-index-b'])
    expect(eligibility.lastScannedAt).toBe(scopedTimestamp)
  })

  it('does not read scan progress when auto indexing is initializing', async () => {
    const { dbUtils, all } = createDbUtils([])
    const service = createService({ dbUtils })

    await expect(
      service.shouldRunAutoIndexing({
        isInitializing: true,
        hasInitializationContext: true
      })
    ).resolves.toEqual({ allowed: false, reason: 'initializing' })
    expect(all).not.toHaveBeenCalled()
    expect(deviceIdleService.canRun).not.toHaveBeenCalled()
  })

  it('skips auto indexing when no path is eligible by interval', async () => {
    const freshTimestamp = Date.now()
    const { dbUtils } = createDbUtils([
      { path: '/tmp/tuff-index-a', lastScanned: freshTimestamp },
      { path: '/tmp/tuff-index-b', lastScanned: freshTimestamp }
    ])
    const service = createService({ dbUtils })

    await expect(
      service.shouldRunAutoIndexing({
        isInitializing: false,
        hasInitializationContext: true
      })
    ).resolves.toEqual({ allowed: false, reason: 'interval' })
    expect(deviceIdleService.canRun).not.toHaveBeenCalled()
  })

  it('runs idle gate when auto indexing preflight and interval pass', async () => {
    const staleTimestamp = Date.now() - 25 * 60 * 60 * 1000
    const { dbUtils } = createDbUtils([
      { path: '/tmp/tuff-index-a', lastScanned: staleTimestamp },
      { path: '/tmp/tuff-index-b', lastScanned: staleTimestamp }
    ])
    const service = createService({ dbUtils })

    await expect(
      service.shouldRunAutoIndexing({
        isInitializing: false,
        hasInitializationContext: true
      })
    ).resolves.toEqual({ allowed: true, battery: null })
    expect(deviceIdleService.canRun).toHaveBeenCalledWith({ idleThresholdMs: 60 * 60 * 1000 })
  })

  it('uses shared auto scan preflight for app busy and search active reasons', async () => {
    vi.mocked(appTaskGate.isActive).mockReturnValueOnce(true)
    const service = createService({ dbUtils: createDbUtils([]).dbUtils })

    await expect(
      service.shouldRunAutoIndexing({
        isInitializing: false,
        hasInitializationContext: true
      })
    ).resolves.toEqual({ allowed: false, reason: 'app-busy' })

    vi.mocked(isSearchRecentlyActive).mockReturnValueOnce(true)
    await expect(
      service.shouldRunAutoIndexing({
        isInitializing: false,
        hasInitializationContext: true
      })
    ).resolves.toEqual({ allowed: false, reason: 'search-active' })
  })

  it('marks file system events subscribed after watcher registration', async () => {
    const service = createService()
    const subscribeToFileSystemEvents = vi.fn()

    await service.ensureFileSystemWatchers({ subscribeToFileSystemEvents })

    expect(subscribeToFileSystemEvents).toHaveBeenCalledTimes(1)
    expect(service.isWatchPathRegistered()).toBe(true)
    expect(service.isFileSystemSubscribed()).toBe(true)
  })

  it('does not subscribe file system events twice after repeated ensure', async () => {
    const service = createService()
    const subscribeToFileSystemEvents = vi.fn()

    await service.ensureFileSystemWatchers({ subscribeToFileSystemEvents })
    await service.ensureFileSystemWatchers({ subscribeToFileSystemEvents })

    expect(FileSystemWatcher.addPath).toHaveBeenCalledTimes(2)
    expect(subscribeToFileSystemEvents).toHaveBeenCalledTimes(1)
  })

  it('exposes only pending permission paths owned by the file watch roots', () => {
    vi.mocked(FileSystemWatcher.getPendingPaths).mockReturnValue([
      '/tmp/tuff-index-a',
      '/Applications'
    ])
    const service = createService()

    expect(service.getPendingPermissionPaths()).toEqual(['/tmp/tuff-index-a'])
  })

  it('checks ownership of file watch roots', () => {
    const service = createService()

    expect(service.ownsWatchPath('/tmp/tuff-index-a')).toBe(true)
    expect(service.ownsWatchPath('/tmp/tuff-index-a/report.md')).toBe(true)
    expect(service.ownsWatchPath('/tmp/tuff-index-old/report.md')).toBe(false)
    expect(service.ownsWatchPath('/Applications')).toBe(false)
  })

  it('deduplicates extra watch paths through normalized roots', () => {
    const service = new FileProviderWatchService({
      baseWatchPaths: ['/tmp/tuff-index-a'],
      getDbUtils: () => null,
      getWatchDepthForPath: () => 1,
      normalizePath: (rawPath) => rawPath.toLowerCase(),
      enqueueIncrementalUpdate: vi.fn(),
      runAutoIndexing: vi.fn(async () => undefined),
      logDebug: vi.fn(),
      logWarn: vi.fn(),
      logError: vi.fn()
    })

    service.applyWatchPaths(['/TMP/TUFF-INDEX-A', '/tmp/tuff-index-b'])

    expect(service.getWatchPaths()).toEqual(['/tmp/tuff-index-a', '/tmp/tuff-index-b'])
    expect(service.getNormalizedWatchPaths()).toEqual(['/tmp/tuff-index-a', '/tmp/tuff-index-b'])
  })
})
