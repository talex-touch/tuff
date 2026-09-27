import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FileProviderWatchService } from './file-provider-watch-service'
import FileSystemWatcher from '../../../file-system-watcher'
import { appTaskGate } from '../../../../../service/app-task-gate'
import { deviceIdleService } from '../../../../../service/device-idle-service'
import { isSearchRecentlyActive } from '../../../search-engine/search-activity'

interface RegisteredBackgroundTask {
  id: string
  execute: () => Promise<void>
}

const backgroundTaskMocks = vi.hoisted(() => ({
  registerTask: vi.fn<(task: RegisteredBackgroundTask) => void>(),
  on: vi.fn(),
  start: vi.fn(),
  recordActivity: vi.fn()
}))

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
    getInstance: vi.fn(() => backgroundTaskMocks)
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
    if (readSqlText(query).includes('PRAGMA table_info(scan_progress)')) {
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

    return rows
  })

  const handle = { all }
  return {
    dbUtils: {
      getDb: vi.fn(() => handle),
      // Scan eligibility reads through the split-aware read home; with the
      // split off (the default in these tests) it is the same handle.
      getFileIndexReadDb: vi.fn(() => handle)
    },
    all
  }
}

/** Drizzle SQL objects stringify to `[object Object]`; read the chunked statement text instead. */
function readSqlText(query: unknown): string {
  const chunks = (query as { queryChunks?: unknown[] } | null)?.queryChunks ?? []
  return chunks
    .map((chunk) => {
      if (typeof chunk === 'string') return chunk
      const value = (chunk as { value?: unknown } | null)?.value
      if (!Array.isArray(value)) return ''
      return value.filter((entry): entry is string => typeof entry === 'string').join('')
    })
    .join('')
}

function createService(
  input: {
    baseWatchPaths?: string[]
    dbUtils?: unknown
    normalizePath?: (rawPath: string) => string
    runAutoIndexing?: () => Promise<boolean>
  } = {}
) {
  return new FileProviderWatchService({
    baseWatchPaths: input.baseWatchPaths ?? ['/tmp/tuff-index-a', '/tmp/tuff-index-b'],
    getDbUtils: () => (input.dbUtils ?? null) as never,
    getWatchDepthForPath: () => 1,
    normalizePath: input.normalizePath ?? ((rawPath) => rawPath),
    runAutoIndexing: input.runAutoIndexing ?? vi.fn(async () => true),
    logDebug: vi.fn(),
    logWarn: vi.fn(),
    logError: vi.fn()
  })
}

/**
 * Boot wiring as production has it: file-provider passes `() => this.runAutoIndexing()`, and that
 * method's first act is `watchService.shouldRunAutoIndexing(...)`. The boot timer and the registered
 * `file-index.auto-scan` task therefore both enter through the same gate, and `startIndexScan` is the
 * only thing that actually walks the tree — which lets a test tell "the check ran" from "a scan ran".
 */
function createGatedService(input: { dbUtils: unknown; startIndexScan: () => Promise<boolean> }) {
  let service: FileProviderWatchService | null = null
  const created = createService({
    dbUtils: input.dbUtils,
    runAutoIndexing: async () => {
      if (!service) {
        throw new Error('watch service not initialized')
      }
      const decision = await service.shouldRunAutoIndexing({
        isInitializing: false,
        hasInitializationContext: true
      })
      return decision.allowed ? input.startIndexScan() : false
    }
  })
  service = created
  return created
}

function findRegisteredTask(id: string): RegisteredBackgroundTask | undefined {
  return backgroundTaskMocks.registerTask.mock.calls
    .map(([task]) => task)
    .find((task) => task.id === id)
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
      lastScannedAt: null,
      hasScanEvidence: false
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

  // V1 ship-blocker #3 regression: with the split on, eligibility must read the
  // (empty) search home — stale primary scan_progress rows must not be able to
  // mark every root "recently scanned" and suppress the full scan forever.
  it('reads eligibility from the split read home, not the stale primary db', async () => {
    const stalePrimary = createDbUtils([
      { path: '/tmp/tuff-index-a', lastScanned: new Date() },
      { path: '/tmp/tuff-index-b', lastScanned: new Date() }
    ])
    const emptySearchHome = createDbUtils([])
    const dbUtils = {
      getDb: stalePrimary.dbUtils.getDb,
      getFileIndexReadDb: emptySearchHome.dbUtils.getFileIndexReadDb
    }
    const service = createService({ dbUtils })

    const eligibility = await service.getScanEligibility()

    expect(eligibility.newPaths).toEqual(['/tmp/tuff-index-a', '/tmp/tuff-index-b'])
    expect(eligibility.lastScannedAt).toBeNull()
    expect(stalePrimary.dbUtils.getDb).not.toHaveBeenCalled()
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

  it('counts a progress row stored under the normalized watch root', async () => {
    const scannedAt = Date.now() - 60 * 60 * 1000
    const { dbUtils } = createDbUtils([{ path: '/users/me/documents', lastScanned: scannedAt }])
    const service = createService({
      baseWatchPaths: ['/Users/me/Documents'],
      dbUtils,
      normalizePath: (rawPath) => rawPath.toLowerCase()
    })

    const eligibility = await service.getScanEligibility()

    expect(eligibility.newPaths).toEqual([])
    expect(eligibility.lastScannedAt).toBe(scannedAt)
    expect(eligibility.hasScanEvidence).toBe(true)
  })

  it('drops watch roots rejected by the normalizer from scan evidence', async () => {
    const acceptedTimestamp = Date.now() - 60 * 60 * 1000
    const rejectedTimestamp = Date.now()
    const { dbUtils } = createDbUtils([
      { path: '/tmp/accepted', lastScanned: acceptedTimestamp },
      { path: '/tmp/rejected', lastScanned: rejectedTimestamp }
    ])
    const service = createService({
      baseWatchPaths: ['/tmp/rejected', '/tmp/accepted'],
      dbUtils,
      normalizePath: (rawPath) => (rawPath.includes('rejected') ? '' : rawPath)
    })

    const eligibility = await service.getScanEligibility()

    expect(service.getWatchPaths()).toEqual(['/tmp/accepted'])
    expect(eligibility.newPaths).toEqual([])
    expect(eligibility.lastScannedAt).toBe(acceptedTimestamp)
    expect(eligibility.hasScanEvidence).toBe(true)
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

  // Regression: progress is written per resumable unit, so a half-walked root only has checkpoint
  // rows for its children. Those must count as the root's progress, newest checkpoint winning —
  // otherwise every boot restarted the walk from scratch.
  it('folds child checkpoint rows onto their watch root', async () => {
    const checkpointTimestamp = Date.now() - 60 * 1000
    const olderCheckpointTimestamp = Date.now() - 2 * 60 * 60 * 1000
    const { dbUtils } = createDbUtils([
      { path: '/tmp/tuff-index-a/sub', lastScanned: olderCheckpointTimestamp },
      { path: '/tmp/tuff-index-a/sub/deep', lastScanned: checkpointTimestamp }
    ])
    const service = createService({ dbUtils })

    const eligibility = await service.getScanEligibility()

    expect(eligibility.newPaths).toEqual(['/tmp/tuff-index-b'])
    expect(eligibility.stalePaths).toEqual([])
    expect(eligibility.lastScannedAt).toBe(checkpointTimestamp)
    expect(eligibility.hasScanEvidence).toBe(true)
  })

  it('treats progress rows owned by no watch root as no scan evidence', async () => {
    const { dbUtils } = createDbUtils([{ path: '/external-index-root', lastScanned: Date.now() }])
    const service = createService({ dbUtils })

    const eligibility = await service.getScanEligibility()

    expect(eligibility.hasScanEvidence).toBe(false)
    expect(eligibility.lastScannedAt).toBeNull()
    expect(eligibility.newPaths).toEqual(['/tmp/tuff-index-a', '/tmp/tuff-index-b'])
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

  it('schedules one startup scan check at 2.5 seconds without duplicating or resetting it', async () => {
    const freshTimestamp = new Date('2026-09-03T00:00:00.000Z').getTime()
    vi.useFakeTimers()
    vi.setSystemTime(freshTimestamp)

    try {
      const { dbUtils } = createDbUtils([
        { path: '/tmp/tuff-index-a', lastScanned: freshTimestamp },
        { path: '/tmp/tuff-index-b', lastScanned: freshTimestamp }
      ])
      const runAutoIndexing = vi.fn<() => Promise<boolean>>().mockResolvedValue(true)
      const service = createService({ dbUtils, runAutoIndexing })

      service.initializeBackgroundTaskService()
      await vi.advanceTimersByTimeAsync(1_000)
      service.initializeBackgroundTaskService()

      await vi.advanceTimersByTimeAsync(1_499)
      expect(runAutoIndexing).not.toHaveBeenCalled()

      await vi.advanceTimersByTimeAsync(1)
      expect(runAutoIndexing).toHaveBeenCalledTimes(1)

      await vi.advanceTimersByTimeAsync(1_000)
      expect(runAutoIndexing).toHaveBeenCalledTimes(1)
      await expect(
        service.shouldRunAutoIndexing({
          isInitializing: false,
          hasInitializationContext: true
        })
      ).resolves.toEqual({ allowed: false, reason: 'interval' })
      expect(deviceIdleService.canRun).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('cancels the pending startup scan check when disposed before the delay', async () => {
    const freshTimestamp = new Date('2026-09-03T00:00:00.000Z').getTime()
    vi.useFakeTimers()
    vi.setSystemTime(freshTimestamp)

    try {
      const { dbUtils } = createDbUtils([
        { path: '/tmp/tuff-index-a', lastScanned: freshTimestamp },
        { path: '/tmp/tuff-index-b', lastScanned: freshTimestamp }
      ])
      const runAutoIndexing = vi.fn<() => Promise<boolean>>().mockResolvedValue(true)
      const service = createService({ dbUtils, runAutoIndexing })

      service.initializeBackgroundTaskService()
      service.dispose()

      await vi.advanceTimersByTimeAsync(2_500)

      expect(runAutoIndexing).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  // Regression: the boot path no longer carries a flag that forces a scan. The boot check enters the
  // same gate as the recurring task, so fresh progress rows mean no walk — and the idle service is
  // never even consulted (the removed code always queried it with `idleThresholdMs: 0`).
  it('refuses the boot check and the recurring task while progress rows are fresh', async () => {
    const bootTimestamp = new Date('2026-09-03T00:00:00.000Z').getTime()
    vi.useFakeTimers()
    vi.setSystemTime(bootTimestamp)

    try {
      const { dbUtils } = createDbUtils([
        { path: '/tmp/tuff-index-a', lastScanned: bootTimestamp },
        { path: '/tmp/tuff-index-b', lastScanned: bootTimestamp }
      ])
      const startIndexScan = vi.fn(async () => true)
      const service = createGatedService({ dbUtils, startIndexScan })

      service.initializeBackgroundTaskService()
      const autoTask = findRegisteredTask('file-index.auto-scan')
      expect(autoTask).toBeDefined()

      await vi.advanceTimersByTimeAsync(2_500)

      expect(startIndexScan).not.toHaveBeenCalled()
      expect(deviceIdleService.canRun).not.toHaveBeenCalled()

      await autoTask?.execute()

      expect(startIndexScan).not.toHaveBeenCalled()
      await expect(
        service.shouldRunAutoIndexing({
          isInitializing: false,
          hasInitializationContext: true
        })
      ).resolves.toEqual({ allowed: false, reason: 'interval' })
      expect(deviceIdleService.canRun).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  // A first-ever run has nothing to search until one scan finishes, so it may start without waiting
  // for idle — the only case where the boot check scans with an empty search index.
  it('lets the first-ever scan start from the boot check without waiting for idle', async () => {
    const bootTimestamp = new Date('2026-09-03T00:00:00.000Z').getTime()
    vi.useFakeTimers()
    vi.setSystemTime(bootTimestamp)

    try {
      const { dbUtils } = createDbUtils([])
      const startIndexScan = vi.fn(async () => true)
      const service = createGatedService({ dbUtils, startIndexScan })

      service.initializeBackgroundTaskService()
      expect(startIndexScan).not.toHaveBeenCalled()

      await vi.advanceTimersByTimeAsync(2_500)

      expect(startIndexScan).toHaveBeenCalledTimes(1)
      expect(deviceIdleService.canRun).toHaveBeenCalledTimes(1)
      expect(deviceIdleService.canRun).toHaveBeenCalledWith({ idleThresholdMs: 0 })
    } finally {
      vi.useRealTimers()
    }
  })

  it('waits for the configured idle window at the boot check when a watch root is stale', async () => {
    const bootTimestamp = new Date('2026-09-03T00:00:00.000Z').getTime()
    vi.useFakeTimers()
    vi.setSystemTime(bootTimestamp)

    try {
      const staleTimestamp = bootTimestamp - 25 * 60 * 60 * 1000
      const { dbUtils } = createDbUtils([
        { path: '/tmp/tuff-index-a', lastScanned: staleTimestamp },
        { path: '/tmp/tuff-index-b', lastScanned: bootTimestamp }
      ])
      const startIndexScan = vi.fn(async () => true)
      const service = createGatedService({ dbUtils, startIndexScan })

      service.initializeBackgroundTaskService()
      await vi.advanceTimersByTimeAsync(2_500)

      expect(startIndexScan).toHaveBeenCalledTimes(1)
      expect(deviceIdleService.canRun).toHaveBeenCalledTimes(1)
      expect(deviceIdleService.canRun).toHaveBeenCalledWith({ idleThresholdMs: 60 * 60 * 1000 })
    } finally {
      vi.useRealTimers()
    }
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

  it('matches only path-segment descendants for literal percent and underscore watch roots', () => {
    const service = createService({ baseWatchPaths: ['/x/foo', '/x/100%_literal'] })

    expect(service.ownsWatchPath('/x/foo/report.md')).toBe(true)
    expect(service.ownsWatchPath('/x/foo2/report.md')).toBe(false)
    expect(service.ownsWatchPath('/x/100%_literal/report.md')).toBe(true)
    expect(service.ownsWatchPath('/x/100aa_literal/report.md')).toBe(false)
    expect(service.ownsWatchPath('/x/100%xliteral/report.md')).toBe(false)
  })

  it('deduplicates extra watch paths through normalized roots', () => {
    const service = new FileProviderWatchService({
      baseWatchPaths: ['/tmp/tuff-index-a'],
      getDbUtils: () => null,
      getWatchDepthForPath: () => 1,
      normalizePath: (rawPath) => rawPath.toLowerCase(),
      runAutoIndexing: vi.fn(async () => true),
      logDebug: vi.fn(),
      logWarn: vi.fn(),
      logError: vi.fn()
    })

    service.applyWatchPaths(['/TMP/TUFF-INDEX-A', '/tmp/tuff-index-b'])

    expect(service.getWatchPaths()).toEqual(['/tmp/tuff-index-a', '/tmp/tuff-index-b'])
    expect(service.getNormalizedWatchPaths()).toEqual(['/tmp/tuff-index-a', '/tmp/tuff-index-b'])
  })
})
