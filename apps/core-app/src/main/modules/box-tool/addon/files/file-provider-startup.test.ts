import { afterEach, describe, expect, it, vi } from 'vitest'
import type { IndexedSourceResetReason } from '@talex-touch/utils/search'
import { IndexedSourceResetReasons } from '@talex-touch/utils/search'

const {
  transportOn,
  appTaskWaitForIdle,
  searchIndexWorkerInit,
  watchServiceInitialize,
  watchServiceEnsure
} = vi.hoisted(() => ({
  transportOn: vi.fn(),
  appTaskWaitForIdle: vi.fn(async () => true),
  searchIndexWorkerInit: vi.fn(async () => undefined),
  watchServiceInitialize: vi.fn(),
  watchServiceEnsure: vi.fn(async () => undefined)
}))

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn((name: string) => `/tmp/tuff-file-provider-${name}`)
  },
  shell: {
    openPath: vi.fn()
  }
}))

vi.mock('@talex-touch/utils/common/logger', () => ({
  loggerManager: {
    getLogger: vi.fn(() => ({
      setEnabled: vi.fn()
    }))
  },
  getLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn()
  }))
}))

vi.mock('@talex-touch/utils/transport/main', () => ({
  getTuffTransportMain: vi.fn(() => ({
    on: transportOn,
    broadcast: vi.fn()
  }))
}))

vi.mock('../../../../db/utils', () => ({
  createDbUtils: vi.fn((db) => ({
    getDb: () => db,
    getAuxDb: () => db
  }))
}))

vi.mock('../../../../service/app-task-gate', () => ({
  appTaskGate: {
    waitForIdle: appTaskWaitForIdle,
    isActive: vi.fn(() => false)
  }
}))

vi.mock('../../../../db/db-write-scheduler', () => ({
  dbWriteScheduler: {
    schedule: vi.fn((_label: string, operation: () => Promise<unknown>) => operation())
  }
}))

vi.mock('../../../../db/sqlite-retry', () => ({
  withSqliteRetry: vi.fn((operation: () => Promise<unknown>) => operation())
}))

vi.mock('./embedding-service', () => ({
  EmbeddingService: vi.fn(() => ({
    semanticSearch: vi.fn(async () => [])
  }))
}))

vi.mock('./services/file-provider-watch-service', () => ({
  FileProviderWatchService: vi.fn().mockImplementation((deps) => ({
    getCurrentSettings: vi.fn(() => ({
      autoScanEnabled: true,
      autoScanIntervalMs: 86_400_000,
      autoScanIdleThresholdMs: 3_600_000,
      autoScanCheckIntervalMs: 300_000,
      extraPaths: []
    })),
    getWatchPaths: vi.fn(() => deps.baseWatchPaths),
    getNormalizedWatchPaths: vi.fn(() => deps.baseWatchPaths),
    isWatchPathRegistered: vi.fn(() => false),
    isFileSystemSubscribed: vi.fn(() => false),
    initializeBackgroundTaskService: watchServiceInitialize,
    ensureFileSystemWatchers: watchServiceEnsure,
    recordUserActivity: vi.fn(),
    shouldRunAutoIndexing: vi.fn(async () => ({ allowed: false, reason: 'test' })),
    applyWatchPaths: vi.fn(),
    handleFsAddedOrChanged: vi.fn(),
    handleFsUnlinked: vi.fn()
  }))
}))

vi.mock('./services/file-provider-opener-service', () => ({
  FileProviderOpenerService: vi.fn(() => ({
    getOpenerForExtension: vi.fn(async () => null)
  }))
}))

vi.mock('./services/file-provider-index-runtime-service', () => ({
  FileProviderIndexRuntimeService: vi.fn(() => ({
    handleIndexWorkerFile: vi.fn(),
    initWorker: vi.fn(async () => undefined),
    flushPendingIndexResults: vi.fn(async () => undefined)
  }))
}))

vi.mock('./workers/file-index-worker-client', () => ({
  FileIndexWorkerClient: vi.fn(() => ({
    getStatus: vi.fn(async () => null),
    shutdown: vi.fn()
  }))
}))

vi.mock('./workers/file-reconcile-worker-client', () => ({
  FileReconcileWorkerClient: vi.fn(() => ({
    getStatus: vi.fn(async () => null),
    shutdown: vi.fn()
  }))
}))

vi.mock('./workers/file-scan-worker-client', () => ({
  FileScanWorkerClient: vi.fn(() => ({
    getStatus: vi.fn(async () => null),
    shutdown: vi.fn()
  }))
}))

vi.mock('./workers/icon-worker-client', () => ({
  IconWorkerClient: vi.fn(() => ({
    getStatus: vi.fn(async () => null),
    shutdown: vi.fn(),
    extract: vi.fn(async () => null)
  }))
}))

vi.mock('./workers/thumbnail-worker-client', () => ({
  ThumbnailWorkerClient: vi.fn(() => ({
    getStatus: vi.fn(async () => null),
    shutdown: vi.fn()
  }))
}))

vi.mock('../../search-engine/workers/search-index-worker-client', () => ({
  SearchIndexWorkerClient: vi.fn(() => ({
    init: searchIndexWorkerInit,
    getStatus: vi.fn(async () => null),
    shutdown: vi.fn()
  }))
}))

import { fileProvider } from './file-provider'

interface MutableFileProvider {
  onLoad: (context: {
    touchApp: { channel: unknown }
    databaseManager: { getDb: () => unknown; filePath: string }
    searchIndex: unknown
  }) => Promise<void>
  backgroundStartupPromise: Promise<void> | null
  backgroundStartupReady: boolean
  backgroundStartupError: Error | null
  searchIndexWorkerReady: Promise<boolean> | null
  openersChannelRegistered: boolean
  getIndexingStatus: () => {
    startupReady?: boolean
    startupPending?: boolean
    startupError?: string | null
  }
  buildStartupDegradedNotice: (query: { text: string; inputs: unknown[] }) => {
    render?: {
      basic?: {
        title?: string
        description?: string
      }
    }
    actions?: Array<{
      id?: string
      type?: string
      payload?: {
        path?: string
      }
    }>
  } | null
}

interface FileProviderIndexingLifecycleTestApi extends MutableFileProvider {
  ensureFileSystemWatchers: () => Promise<void>
  startIndexing: (source: 'auto' | 'manual') => Promise<{
    added: number
    changed: number
    deleted: number
    skipped: number
    errors: number
  }>
  reconcileIndexedSource: (request: { sourceId: string }) => Promise<{
    sourceId: string
    added: number
    changed: number
    deleted: number
    skipped: number
    errors: number
    startedAt: number
    completedAt: number
    reason?: string
  }>
  rebuildIndex: (request?: { force?: boolean }) => Promise<{
    success: boolean
    reason?: string
    error?: string
  }>
  isInitializing: Promise<unknown> | null
  initializationContext: {
    databaseManager: { getDb: () => unknown; filePath: string }
    searchIndex: unknown
    touchApp: { channel: unknown }
  } | null
  dbUtils: unknown | null
  getBatteryLevel: () => Promise<null>
  setIndexedSourceRuntimeResetDelegate: (
    delegate:
      | null
      | ((request: {
          sourceId: string
          reason: Extract<
            IndexedSourceResetReason,
            | typeof IndexedSourceResetReasons.ManualRebuild
            | typeof IndexedSourceResetReasons.SchemaMigration
            | typeof IndexedSourceResetReasons.IntegrityRepair
          >
          clearSearchIndex?: boolean
          clearScanProgress?: boolean
        }) => Promise<{
          sourceId: string
          reason: Extract<
            IndexedSourceResetReason,
            | typeof IndexedSourceResetReasons.ManualRebuild
            | typeof IndexedSourceResetReasons.SchemaMigration
            | typeof IndexedSourceResetReasons.IntegrityRepair
          >
          clearedSearchIndex: boolean
          clearedScanProgress: boolean
          scanProgressRows?: number
          startedAt: number
          completedAt: number
        }>)
  ) => void
  runIntegrityCheck: (db: {
    select: (selection: unknown) => {
      from: (table: unknown) => {
        where: (condition: unknown) => Promise<Array<{ cnt: number }>>
      }
    }
    all: (query: unknown) => Promise<Array<{ cnt: number }>>
  }) => Promise<void>
  countSearchIndexByProvider: (providerId: string, reason: string) => Promise<number>
  lastIntegritySnapshot: {
    needsRebuild: boolean
    clearedSearchIndex: boolean
    clearedScanProgress: boolean
    resetReason?: string | null
    resetScanProgressRows?: number
  } | null
  mapFileToIndexedSourceRecord: (file: {
    path: string
    name: string
    displayName?: string | null
    extension?: string | null
    size?: number | null
    mtime: Date | number | string
    type: string
    isDir: boolean
  }) => {
    sourceId: string
    recordId: string
    stableKey: string
    kind: string
    title: string
    subtitle?: string
    path?: string
    mtime?: number
    size?: number
    metadata?: Record<string, unknown>
  }
  isWithinWatchRoots: (rawPath: string) => boolean
  enqueueIncrementalUpdate: (
    rawPath: string,
    action: 'add' | 'change' | 'delete',
    options?: { manual?: boolean }
  ) => void
  buildFileRecord: (rawPath: string) => Promise<{
    path: string
    name: string
    displayName?: string | null
    extension?: string | null
    size?: number | null
    mtime: Date | number | string
    ctime: Date | number | string
    lastIndexedAt?: Date | number | string
    type: string
    isDir: boolean
  } | null>
  handleIndexedSourceWatchEvent: (event: {
    sourceId?: string
    action: 'add' | 'change' | 'delete'
    path: string
    occurredAt: number
  }) => Promise<
    Array<{
      sourceId: string
      action: 'add' | 'change' | 'delete'
      record?: unknown
      stableKey?: string
      path?: string
      reason?: string
    }>
  >
}

function createContext() {
  return {
    touchApp: { channel: {} },
    databaseManager: {
      getDb: () => ({}),
      filePath: '/tmp/tuff-file-provider-db'
    },
    searchIndex: {}
  }
}

function resetProviderState(provider: MutableFileProvider): void {
  provider.backgroundStartupPromise = null
  provider.backgroundStartupReady = false
  provider.backgroundStartupError = null
  provider.searchIndexWorkerReady = null
  provider.openersChannelRegistered = false
}

afterEach(() => {
  const provider = fileProvider as unknown as MutableFileProvider
  resetProviderState(provider)
  vi.clearAllMocks()
  appTaskWaitForIdle.mockResolvedValue(true)
  searchIndexWorkerInit.mockResolvedValue(undefined)
})

describe('file-provider startup readiness', () => {
  it('registers channels without blocking on search-index worker or filesystem watcher roots', async () => {
    const provider = fileProvider as unknown as MutableFileProvider
    resetProviderState(provider)

    let releaseIdle: (value: boolean) => void = () => {}
    appTaskWaitForIdle.mockImplementation(
      () =>
        new Promise<boolean>((resolve) => {
          releaseIdle = resolve
        })
    )

    await provider.onLoad(createContext())

    expect(transportOn).toHaveBeenCalledTimes(2)
    expect(searchIndexWorkerInit).not.toHaveBeenCalled()
    expect(watchServiceInitialize).not.toHaveBeenCalled()
    expect(watchServiceEnsure).not.toHaveBeenCalled()
    expect(provider.getIndexingStatus()).toEqual(
      expect.objectContaining({
        startupReady: false,
        startupPending: true,
        startupError: null
      })
    )

    await new Promise<void>((resolve) => setImmediate(resolve))
    releaseIdle(true)
    await provider.backgroundStartupPromise

    expect(searchIndexWorkerInit).toHaveBeenCalledWith('/tmp/tuff-file-provider-db/database.db')
    expect(watchServiceInitialize).toHaveBeenCalledTimes(1)
    expect(watchServiceEnsure).toHaveBeenCalledTimes(1)
    expect(transportOn).toHaveBeenCalledTimes(2)
    expect(provider.getIndexingStatus()).toEqual(
      expect.objectContaining({
        startupReady: true,
        startupPending: false,
        startupError: null
      })
    )
  })

  it('reports reconcile stats from the indexing run', async () => {
    const provider = fileProvider as unknown as FileProviderIndexingLifecycleTestApi
    const originalEnsureFileSystemWatchers = provider.ensureFileSystemWatchers
    const originalStartIndexing = provider.startIndexing

    provider.ensureFileSystemWatchers = vi.fn(async () => undefined)
    provider.startIndexing = vi.fn(async () => ({
      added: 3,
      changed: 2,
      deleted: 1,
      skipped: 5,
      errors: 0
    }))

    try {
      const result = await provider.reconcileIndexedSource({ sourceId: 'file-provider' })

      expect(provider.ensureFileSystemWatchers).toHaveBeenCalledTimes(1)
      expect(provider.startIndexing).toHaveBeenCalledWith(
        'auto',
        expect.objectContaining({
          onDelta: expect.any(Function)
        })
      )
      expect(result).toMatchObject({
        sourceId: 'file-provider',
        added: 3,
        changed: 2,
        deleted: 1,
        skipped: 5,
        errors: 0,
        deltas: [],
        reason: 'file-index-reconciliation'
      })
      expect(result.completedAt).toBeGreaterThanOrEqual(result.startedAt)
    } finally {
      provider.ensureFileSystemWatchers = originalEnsureFileSystemWatchers
      provider.startIndexing = originalStartIndexing
    }
  })

  it('routes integrity mismatch reset through the indexed runtime delegate', async () => {
    const provider = fileProvider as unknown as FileProviderIndexingLifecycleTestApi
    const originalCountSearchIndexByProvider = provider.countSearchIndexByProvider
    const resetDelegate = vi.fn(async () => ({
      sourceId: 'file-provider',
      reason: IndexedSourceResetReasons.IntegrityRepair,
      clearedSearchIndex: true,
      clearedScanProgress: true,
      scanProgressRows: 2,
      startedAt: 1,
      completedAt: 2
    }))
    const db = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(async () => [{ cnt: 10 }])
        }))
      })),
      all: vi.fn(async () => [])
    }

    provider.countSearchIndexByProvider = vi.fn(async () => 1)
    provider.setIndexedSourceRuntimeResetDelegate(resetDelegate)

    try {
      await provider.runIntegrityCheck(db)

      expect(resetDelegate).toHaveBeenCalledWith({
        sourceId: 'file-provider',
        reason: IndexedSourceResetReasons.IntegrityRepair,
        clearSearchIndex: true,
        clearScanProgress: true
      })
      expect(provider.lastIntegritySnapshot).toMatchObject({
        needsRebuild: true,
        clearedSearchIndex: true,
        clearedScanProgress: true,
        resetReason: IndexedSourceResetReasons.IntegrityRepair,
        resetScanProgressRows: 2
      })
    } finally {
      provider.countSearchIndexByProvider = originalCountSearchIndexByProvider
      provider.setIndexedSourceRuntimeResetDelegate(null)
    }
  })

  it('routes manual rebuild reset through the indexed runtime delegate', async () => {
    const provider = fileProvider as unknown as FileProviderIndexingLifecycleTestApi
    const originalIsInitializing = provider.isInitializing
    const originalInitializationContext = provider.initializationContext
    const originalDbUtils = provider.dbUtils
    const originalGetBatteryLevel = provider.getBatteryLevel
    const originalEnsureFileSystemWatchers = provider.ensureFileSystemWatchers
    const originalStartIndexing = provider.startIndexing
    const resetDelegate = vi.fn(async () => ({
      sourceId: 'file-provider',
      reason: IndexedSourceResetReasons.ManualRebuild,
      clearedSearchIndex: false,
      clearedScanProgress: true,
      scanProgressRows: 2,
      startedAt: 1,
      completedAt: 2
    }))

    provider.isInitializing = null
    provider.initializationContext = createContext()
    provider.dbUtils = {
      getDb: () => ({})
    }
    provider.getBatteryLevel = vi.fn(async () => null)
    provider.ensureFileSystemWatchers = vi.fn(async () => undefined)
    provider.startIndexing = vi.fn(async () => ({
      added: 0,
      changed: 0,
      deleted: 0,
      skipped: 0,
      errors: 0
    }))
    provider.setIndexedSourceRuntimeResetDelegate(resetDelegate)

    try {
      await expect(provider.rebuildIndex({ force: true })).resolves.toMatchObject({
        success: true
      })

      expect(resetDelegate).toHaveBeenCalledWith({
        sourceId: 'file-provider',
        reason: IndexedSourceResetReasons.ManualRebuild,
        clearScanProgress: true
      })
      expect(provider.startIndexing).toHaveBeenCalledWith('manual')
    } finally {
      provider.isInitializing = originalIsInitializing
      provider.initializationContext = originalInitializationContext
      provider.dbUtils = originalDbUtils
      provider.getBatteryLevel = originalGetBatteryLevel
      provider.ensureFileSystemWatchers = originalEnsureFileSystemWatchers
      provider.startIndexing = originalStartIndexing
      provider.setIndexedSourceRuntimeResetDelegate(null)
    }
  })

  it('maps file rows into indexed source records', () => {
    const provider = fileProvider as unknown as FileProviderIndexingLifecycleTestApi
    const mtime = new Date('2026-05-30T00:00:00.000Z')

    expect(
      provider.mapFileToIndexedSourceRecord({
        path: '/Users/demo/Documents/a.md',
        name: 'a.md',
        displayName: null,
        extension: '.md',
        size: 128,
        mtime,
        type: 'file',
        isDir: false
      })
    ).toEqual({
      sourceId: 'file-provider',
      recordId: '/Users/demo/Documents/a.md',
      stableKey: '/Users/demo/Documents/a.md',
      kind: 'file',
      title: 'a.md',
      subtitle: '/Users/demo/Documents/a.md',
      path: '/Users/demo/Documents/a.md',
      mtime: mtime.getTime(),
      size: 128,
      metadata: {
        extension: '.md',
        type: 'file',
        isDir: false
      }
    })
  })

  it('returns concrete watch deltas for runtime store updates', async () => {
    const provider = fileProvider as unknown as FileProviderIndexingLifecycleTestApi
    const originalIsWithinWatchRoots = provider.isWithinWatchRoots
    const originalEnqueueIncrementalUpdate = provider.enqueueIncrementalUpdate
    const originalBuildFileRecord = provider.buildFileRecord
    const mtime = new Date('2026-05-30T00:00:00.000Z')

    provider.isWithinWatchRoots = vi.fn(() => true)
    provider.enqueueIncrementalUpdate = vi.fn()
    provider.buildFileRecord = vi.fn(async () => ({
      path: '/Users/demo/Documents/a.md',
      name: 'a.md',
      displayName: null,
      extension: '.md',
      size: 128,
      mtime,
      ctime: mtime,
      lastIndexedAt: mtime,
      type: 'file',
      isDir: false
    }))

    try {
      await expect(
        provider.handleIndexedSourceWatchEvent({
          sourceId: 'file-provider',
          action: 'delete',
          path: '/Users/demo/Documents/a.md',
          occurredAt: 1700000000000
        })
      ).resolves.toEqual([
        {
          sourceId: 'file-provider',
          action: 'delete',
          stableKey: '/Users/demo/Documents/a.md',
          path: '/Users/demo/Documents/a.md',
          reason: 'file-provider-watch-delete'
        }
      ])

      await expect(
        provider.handleIndexedSourceWatchEvent({
          sourceId: 'file-provider',
          action: 'change',
          path: '/Users/demo/Documents/a.md',
          occurredAt: 1700000000000
        })
      ).resolves.toEqual([
        {
          sourceId: 'file-provider',
          action: 'change',
          record: expect.objectContaining({
            sourceId: 'file-provider',
            recordId: '/Users/demo/Documents/a.md',
            kind: 'file',
            title: 'a.md'
          }),
          path: '/Users/demo/Documents/a.md',
          reason: 'file-provider-watch-event'
        }
      ])
      expect(provider.enqueueIncrementalUpdate).toHaveBeenCalledWith(
        '/Users/demo/Documents/a.md',
        'change',
        { manual: false }
      )
    } finally {
      provider.isWithinWatchRoots = originalIsWithinWatchRoots
      provider.enqueueIncrementalUpdate = originalEnqueueIncrementalUpdate
      provider.buildFileRecord = originalBuildFileRecord
    }
  })

  it('ignores watch events outside configured roots', async () => {
    const provider = fileProvider as unknown as FileProviderIndexingLifecycleTestApi
    const originalIsWithinWatchRoots = provider.isWithinWatchRoots
    const originalEnqueueIncrementalUpdate = provider.enqueueIncrementalUpdate

    provider.isWithinWatchRoots = vi.fn(() => false)
    provider.enqueueIncrementalUpdate = vi.fn()

    try {
      await expect(
        provider.handleIndexedSourceWatchEvent({
          sourceId: 'file-provider',
          action: 'change',
          path: '/tmp/outside.md',
          occurredAt: 1700000000000
        })
      ).resolves.toEqual([])
      expect(provider.enqueueIncrementalUpdate).not.toHaveBeenCalled()
    } finally {
      provider.isWithinWatchRoots = originalIsWithinWatchRoots
      provider.enqueueIncrementalUpdate = originalEnqueueIncrementalUpdate
    }
  })

  it('keeps startup degraded when the search-index worker cannot initialize', async () => {
    const provider = fileProvider as unknown as MutableFileProvider
    resetProviderState(provider)
    searchIndexWorkerInit.mockRejectedValueOnce(new Error('worker unavailable'))

    await provider.onLoad(createContext())
    await provider.backgroundStartupPromise

    expect(watchServiceInitialize).toHaveBeenCalledTimes(1)
    expect(watchServiceEnsure).toHaveBeenCalledTimes(1)
    expect(provider.getIndexingStatus()).toEqual(
      expect.objectContaining({
        startupReady: false,
        startupPending: false,
        startupError: 'Search index worker initialization failed'
      })
    )
  })

  it('builds a partial result notice while file index startup is pending', () => {
    const provider = fileProvider as unknown as MutableFileProvider
    resetProviderState(provider)
    provider.backgroundStartupPromise = Promise.resolve()

    const notice = provider.buildStartupDegradedNotice({ text: 'report', inputs: [] })

    expect(notice?.render?.basic?.title).toBe('File search is warming up')
    expect(notice?.render?.basic?.description).toContain('partial')
    expect(notice?.actions).toEqual([
      expect.objectContaining({
        id: 'open-file-index-settings',
        type: 'navigate',
        payload: expect.objectContaining({ path: '/setting?section=file-index' })
      })
    ])
  })
})
