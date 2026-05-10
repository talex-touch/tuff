import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FileProviderWatchService } from './file-provider-watch-service'
import FileSystemWatcher from '../../../file-system-watcher'
import { scanProgress } from '../../../../../db/schema'

vi.mock('@talex-touch/utils', () => ({
  StorageList: {
    FILE_INDEX_SETTINGS: 'file-index-settings.json'
  }
}))

vi.mock('../../../file-system-watcher', () => ({
  default: {
    addPath: vi.fn(async () => undefined)
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

function createDbUtils(rows: Array<{ path: string; lastScanned: unknown }>) {
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

function createService(input: { dbUtils?: unknown } = {}) {
  return new FileProviderWatchService({
    baseWatchPaths: ['/tmp/tuff-index-a', '/tmp/tuff-index-b'],
    getDbUtils: () => (input.dbUtils ?? null) as never,
    getWatchDepthForPath: () => 1,
    normalizePath: (rawPath) => rawPath,
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

  it('reads scan progress through the drizzle schema table', async () => {
    const scannedAt = new Date()
    const { dbUtils, from } = createDbUtils([{ path: '/tmp/tuff-index-a', lastScanned: scannedAt }])
    const service = createService({ dbUtils })

    const eligibility = await service.getScanEligibility()

    expect(from).toHaveBeenCalledWith(scanProgress)
    expect(eligibility.newPaths).toEqual(['/tmp/tuff-index-b'])
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
})
