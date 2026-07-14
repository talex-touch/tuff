import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { TuffItem } from '@talex-touch/utils'
import type { IndexedSourceResetReason } from '@talex-touch/utils/search'
import type { FileProviderIndexFlushSnapshot } from './services/file-provider-index-runtime-service'
import { IndexedSourceResetReasons, IndexedSourceScanReasons } from '@talex-touch/utils/search'

const {
  transportOn,
  appTaskWaitForIdle,
  searchIndexWorkerInit,
  searchIndexWorkerRemoveProviderItems,
  watchServiceInitialize,
  watchServiceEnsure,
  fileIndexWorkerHasPendingWork,
  searchIndexWorkerHasPendingWork,
  indexRuntimeFlush,
  indexRuntimeGetFlushSnapshot
} = vi.hoisted(() => ({
  transportOn: vi.fn(),
  appTaskWaitForIdle: vi.fn(async () => true),
  searchIndexWorkerInit: vi.fn(async () => undefined),
  searchIndexWorkerRemoveProviderItems: vi.fn<
    (providerId: string, itemIds: string[]) => Promise<void>
  >(async () => undefined),
  watchServiceInitialize: vi.fn(),
  watchServiceEnsure: vi.fn(async () => undefined),
  fileIndexWorkerHasPendingWork: vi.fn(() => false),
  searchIndexWorkerHasPendingWork: vi.fn(() => false),
  indexRuntimeFlush: vi.fn(async () => undefined),
  indexRuntimeGetFlushSnapshot: vi.fn<() => FileProviderIndexFlushSnapshot | null>(() => null)
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
  isSqliteBusyError: vi.fn(() => false),
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
    getPendingPermissionPaths: vi.fn(() => []),
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
    flush: indexRuntimeFlush,
    getFlushSnapshot: indexRuntimeGetFlushSnapshot
  }))
}))

vi.mock('./workers/file-index-worker-client', () => ({
  FileIndexWorkerClient: vi.fn(() => ({
    getStatus: vi.fn(async () => null),
    hasPendingWork: fileIndexWorkerHasPendingWork,
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
    shutdown: vi.fn(),
    generate: vi.fn(async () => ({ status: 'unsupported', reason: 'test', durationMs: 0 }))
  }))
}))

vi.mock('../../search-engine/workers/search-index-worker-client', () => ({
  SearchIndexWorkerClient: vi.fn(() => ({
    init: searchIndexWorkerInit,
    getStatus: vi.fn(async () => null),
    removeProviderItems: searchIndexWorkerRemoveProviderItems,
    hasPendingWork: searchIndexWorkerHasPendingWork,
    shutdown: vi.fn()
  }))
}))

import { fileProvider, resolveFileProviderBaseWatchPaths } from './file-provider'

interface MutableFileProvider {
  onLoad: (context: {
    touchApp: { channel: unknown }
    databaseManager: { getDb: () => unknown; filePath: string }
    searchIndex: unknown
  }) => Promise<void>
  onSearch: (
    query: { text: string; inputs: unknown[] },
    signal: AbortSignal
  ) => Promise<{ items: unknown[] }>
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
  startIndexing: (
    source: 'auto' | 'manual',
    options?: {
      onRecordBatch?: (batch: {
        sourceId: string
        records: unknown[]
        done?: boolean
      }) => void | Promise<void>
      onDelta?: (delta: unknown) => void | Promise<void>
    }
  ) => Promise<{
    added: number
    changed: number
    deleted: number
    skipped: number
    errors: number
  }>
  scanIndexedSource: (request: { sourceId: string; reason: string }) => Promise<{
    batches: Array<{
      sourceId: string
      records: unknown[]
      done?: boolean
    }>
  } | null>
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
  searchIndex: unknown | null
  databaseFilePath: string | null
  embeddingService: { semanticSearch: (query: string, limit: number) => Promise<unknown[]> } | null
  searchIndexWorker: {
    removeProviderItems: (providerId: string, itemIds: string[]) => Promise<void>
  }
  getBatteryLevel: () => Promise<null>
  getIndexedSourceEvidence: () => Promise<
    Array<{
      id: string
      label: string
      status: string
      itemCount?: number
      lastCheckedAt?: number
      reason?: string
      metadata?: Record<string, unknown>
    }>
  >
  recordRuntimeWriteSnapshot: (
    service: unknown,
    input: {
      entries: number
      reason: string
      metadata?: Record<string, unknown>
      durationMs?: number
    }
  ) => void
  incrementalPersistSnapshotService: unknown
  ftsWriteSnapshotService: unknown
  ftsDeleteSnapshotService: unknown
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

function createDeferred<T>(): {
  promise: Promise<T>
  resolve: (value: T | PromiseLike<T>) => void
  reject: (reason?: unknown) => void
} {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function createFileSearchRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    path: '/Users/demo/Documents/report.txt',
    name: 'report.txt',
    displayName: null,
    extension: '.txt',
    size: 128,
    mtime: new Date('2026-06-18T00:00:00.000Z'),
    ctime: new Date('2026-06-17T00:00:00.000Z'),
    lastIndexedAt: new Date('2026-06-18T00:00:00.000Z'),
    isDir: false,
    type: 'file',
    content: null,
    embeddingStatus: 'none',
    ...overrides
  }
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
  vi.useRealTimers()
  const provider = fileProvider as unknown as MutableFileProvider
  resetProviderState(provider)
  vi.clearAllMocks()
  appTaskWaitForIdle.mockResolvedValue(true)
  searchIndexWorkerInit.mockResolvedValue(undefined)
  fileIndexWorkerHasPendingWork.mockReturnValue(false)
  searchIndexWorkerHasPendingWork.mockReturnValue(false)
  indexRuntimeFlush.mockResolvedValue(undefined)
  searchIndexWorkerRemoveProviderItems.mockResolvedValue(undefined)
  indexRuntimeGetFlushSnapshot.mockReturnValue(null)
})

describe('file-provider startup readiness', () => {
  it('can override base watch roots for isolated packaged evidence', () => {
    const roots = resolveFileProviderBaseWatchPaths({
      envValue: ['/tmp/tuff-r3-fixture', ' /tmp/tuff-r3-fixture ', '/tmp/tuff-r3-other'].join(
        path.delimiter
      ),
      getPath: vi.fn(() => {
        throw new Error('default paths should not be read')
      })
    })

    expect(roots).toEqual([
      path.resolve('/tmp/tuff-r3-fixture'),
      path.resolve('/tmp/tuff-r3-other')
    ])
  })

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

    expect(searchIndexWorkerInit).toHaveBeenCalledWith(
      expect.stringMatching(/[\\/]tmp[\\/]tuff-file-provider-db[\\/]database\.db$/)
    )
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

  it('returns a terminal done batch after file indexed source scan', async () => {
    const provider = fileProvider as unknown as FileProviderIndexingLifecycleTestApi
    const originalEnsureFileSystemWatchers = provider.ensureFileSystemWatchers
    const originalStartIndexing = provider.startIndexing
    const runtimeBatch = {
      sourceId: 'file-provider',
      records: [
        {
          sourceId: 'file-provider',
          recordId: '/tmp/a.txt',
          stableKey: '/tmp/a.txt',
          kind: 'file',
          title: 'a.txt'
        }
      ]
    }

    provider.ensureFileSystemWatchers = vi.fn(async () => undefined)
    provider.startIndexing = vi.fn(async (_source, options) => {
      await options?.onRecordBatch?.(runtimeBatch)
      return {
        added: 1,
        changed: 0,
        deleted: 0,
        skipped: 0,
        errors: 0
      }
    })

    try {
      await expect(
        provider.scanIndexedSource({
          sourceId: 'file-provider',
          reason: IndexedSourceScanReasons.Scheduled
        })
      ).resolves.toEqual({
        batches: [
          runtimeBatch,
          {
            sourceId: 'file-provider',
            records: [],
            done: true
          }
        ]
      })
      expect(provider.startIndexing).toHaveBeenCalledWith(
        'auto',
        expect.objectContaining({
          onRecordBatch: expect.any(Function)
        })
      )
      expect(indexRuntimeFlush).toHaveBeenCalledTimes(1)
    } finally {
      provider.ensureFileSystemWatchers = originalEnsureFileSystemWatchers
      provider.startIndexing = originalStartIndexing
    }
  })

  it('returns a terminal done batch even when file indexed source scan emits no records', async () => {
    const provider = fileProvider as unknown as FileProviderIndexingLifecycleTestApi
    const originalEnsureFileSystemWatchers = provider.ensureFileSystemWatchers
    const originalStartIndexing = provider.startIndexing

    provider.ensureFileSystemWatchers = vi.fn(async () => undefined)
    provider.startIndexing = vi.fn(async () => ({
      added: 0,
      changed: 0,
      deleted: 0,
      skipped: 0,
      errors: 0
    }))

    try {
      await expect(
        provider.scanIndexedSource({
          sourceId: 'file-provider',
          reason: IndexedSourceScanReasons.Scheduled
        })
      ).resolves.toEqual({
        batches: [
          {
            sourceId: 'file-provider',
            records: [],
            done: true
          }
        ]
      })
      expect(indexRuntimeFlush).toHaveBeenCalledTimes(1)
    } finally {
      provider.ensureFileSystemWatchers = originalEnsureFileSystemWatchers
      provider.startIndexing = originalStartIndexing
    }
  })

  it('drains file search writes before completing manual indexed source scan', async () => {
    const provider = fileProvider as unknown as FileProviderIndexingLifecycleTestApi & {
      rebuildIndex: (options: { force: boolean }) => Promise<{ success: boolean; error?: string }>
      isInitializing: Promise<{
        added: number
        changed: number
        deleted: number
        skipped: number
        errors: number
      }> | null
    }
    const originalRebuildIndex = provider.rebuildIndex
    const originalIsInitializing = provider.isInitializing
    const indexingRun = Promise.resolve({
      added: 1,
      changed: 0,
      deleted: 0,
      skipped: 0,
      errors: 0
    })

    provider.rebuildIndex = vi.fn(async () => {
      provider.isInitializing = indexingRun
      return { success: true }
    })
    provider.isInitializing = null

    try {
      await expect(
        provider.scanIndexedSource({
          sourceId: 'file-provider',
          reason: IndexedSourceScanReasons.ManualRebuild
        })
      ).resolves.toBeNull()

      expect(provider.rebuildIndex).toHaveBeenCalledWith({ force: true })
      expect(indexRuntimeFlush).toHaveBeenCalledTimes(1)
    } finally {
      provider.rebuildIndex = originalRebuildIndex
      provider.isInitializing = originalIsInitializing
    }
  })

  it('fails indexed source scan when search index drain times out', async () => {
    vi.useFakeTimers()
    const provider = fileProvider as unknown as FileProviderIndexingLifecycleTestApi
    const originalEnsureFileSystemWatchers = provider.ensureFileSystemWatchers
    const originalStartIndexing = provider.startIndexing

    provider.ensureFileSystemWatchers = vi.fn(async () => undefined)
    provider.startIndexing = vi.fn(async () => ({
      added: 1,
      changed: 0,
      deleted: 0,
      skipped: 0,
      errors: 0
    }))
    fileIndexWorkerHasPendingWork.mockReturnValue(true)

    try {
      const scan = provider.scanIndexedSource({
        sourceId: 'file-provider',
        reason: IndexedSourceScanReasons.Scheduled
      })
      const assertion = expect(scan).rejects.toThrow(
        'file-index-search-drain-timeout:indexed-source.scan'
      )

      await vi.advanceTimersByTimeAsync(30_500)

      await assertion
      expect(indexRuntimeFlush).toHaveBeenCalled()
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
        clearScanProgress: true,
        clearSearchIndex: true
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

  it('adds index worker flush snapshots to indexed source evidence', async () => {
    const provider = fileProvider as unknown as FileProviderIndexingLifecycleTestApi
    const originalDbUtils = provider.dbUtils

    provider.dbUtils = null
    indexRuntimeGetFlushSnapshot.mockReturnValueOnce({
      status: 'worker-not-ready',
      entries: 2,
      pending: 4,
      inflight: 1,
      reason: 'not-ready',
      error: 'worker unavailable',
      durationMs: 16,
      checkedAt: 1700000000000,
      metadata: {
        withContent: 2
      }
    })

    try {
      const evidence = await provider.getIndexedSourceEvidence()

      expect(evidence).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: 'file-provider:index-flush',
            label: 'File index flush',
            status: 'degraded',
            itemCount: 2,
            lastCheckedAt: 1700000000000,
            reason: 'not-ready',
            metadata: expect.objectContaining({
              status: 'worker-not-ready',
              entries: 2,
              pending: 4,
              inflight: 1,
              durationMs: 16,
              error: 'worker unavailable',
              withContent: 2
            })
          })
        ])
      )
    } finally {
      provider.dbUtils = originalDbUtils
    }
  })

  it('adds runtime write summaries to indexed source evidence', async () => {
    const provider = fileProvider as unknown as FileProviderIndexingLifecycleTestApi
    const originalDbUtils = provider.dbUtils

    provider.dbUtils = null
    provider.recordRuntimeWriteSnapshot(provider.incrementalPersistSnapshotService, {
      entries: 3,
      reason: 'incremental.add-change',
      durationMs: 12,
      metadata: {
        requestedRows: 5,
        insertedRows: 2,
        updatedRows: 1,
        unchangedRows: 2,
        storeBoundary: 'incremental-db-persist'
      }
    })
    provider.recordRuntimeWriteSnapshot(provider.ftsWriteSnapshotService, {
      entries: 4,
      reason: 'full-scan',
      durationMs: 8,
      metadata: {
        requestedRows: 4,
        persistedRows: 4,
        storeBoundary: 'fts-write'
      }
    })
    provider.recordRuntimeWriteSnapshot(provider.ftsDeleteSnapshotService, {
      entries: 2,
      reason: 'incremental.delete',
      durationMs: 5,
      metadata: {
        requestedRows: 2,
        removedItems: 2,
        storeBoundary: 'fts-delete'
      }
    })

    try {
      const evidence = await provider.getIndexedSourceEvidence()

      expect(evidence).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: 'file-provider:incremental-persist',
            label: 'File incremental DB persist',
            status: 'ready',
            itemCount: 3,
            reason: 'incremental.add-change',
            metadata: expect.objectContaining({
              status: 'flushed',
              entries: 3,
              requestedRows: 5,
              insertedRows: 2,
              updatedRows: 1,
              unchangedRows: 2,
              storeBoundary: 'incremental-db-persist',
              durationMs: 12
            })
          }),
          expect.objectContaining({
            id: 'file-provider:fts-write',
            label: 'File FTS write',
            status: 'ready',
            itemCount: 4,
            reason: 'full-scan',
            metadata: expect.objectContaining({
              status: 'flushed',
              entries: 4,
              requestedRows: 4,
              persistedRows: 4,
              storeBoundary: 'fts-write',
              durationMs: 8
            })
          }),
          expect.objectContaining({
            id: 'file-provider:fts-delete',
            label: 'File FTS delete',
            status: 'ready',
            itemCount: 2,
            reason: 'incremental.delete',
            metadata: expect.objectContaining({
              status: 'flushed',
              entries: 2,
              requestedRows: 2,
              removedItems: 2,
              storeBoundary: 'fts-delete',
              durationMs: 5
            })
          })
        ])
      )
    } finally {
      provider.dbUtils = originalDbUtils
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

  it('does not wait for stale search candidate cleanup before returning results', async () => {
    const provider = fileProvider as unknown as FileProviderIndexingLifecycleTestApi
    const originalDbUtils = provider.dbUtils
    const originalSearchIndex = provider.searchIndex
    const originalSearchIndexWorkerReady = provider.searchIndexWorkerReady
    const originalSearchIndexWorker = provider.searchIndexWorker
    const originalEmbeddingService = provider.embeddingService

    const stalePath = '/Users/demo/Documents/stale-report.pdf'
    const whereMock = vi.fn(async () => [])
    const leftJoinMock = vi.fn(() => ({ where: whereMock }))
    const fromMock = vi.fn(() => ({ leftJoin: leftJoinMock }))
    const selectMock = vi.fn(() => ({ from: fromMock }))

    provider.dbUtils = {
      getDb: () => ({ select: selectMock })
    }
    provider.searchIndex = {
      lookupByKeywords: vi.fn(
        async () => new Map([['report', [{ itemId: stalePath, priority: 100 }]]])
      ),
      lookupByKeywordPrefix: vi.fn(async () => []),
      search: vi.fn(async () => [])
    }
    provider.searchIndexWorkerReady = Promise.resolve(true)
    provider.searchIndexWorker = { removeProviderItems: searchIndexWorkerRemoveProviderItems }
    provider.embeddingService = null
    searchIndexWorkerRemoveProviderItems.mockReturnValueOnce(new Promise<void>(() => {}))

    try {
      const resultPromise = provider.onSearch(
        { text: 'report', inputs: [] },
        new AbortController().signal
      )

      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()

      const unresolved = Symbol('unresolved')
      const settled = await Promise.race([resultPromise, Promise.resolve(unresolved)])

      expect(settled).not.toBe(unresolved)
      if (settled === unresolved) {
        throw new Error('Expected file search to return without waiting for stale cleanup.')
      }
      expect(settled.items).toEqual([])

      await Promise.resolve()
      expect(searchIndexWorkerRemoveProviderItems).toHaveBeenCalledWith('file-provider', [
        stalePath
      ])
    } finally {
      provider.dbUtils = originalDbUtils
      provider.searchIndex = originalSearchIndex
      provider.searchIndexWorkerReady = originalSearchIndexWorkerReady
      provider.searchIndexWorker = originalSearchIndexWorker
      provider.embeddingService = originalEmbeddingService
    }
  })

  it('starts precise, prefix, and FTS file search-index reads in parallel before precise resolves', async () => {
    const provider = fileProvider as unknown as FileProviderIndexingLifecycleTestApi
    const originalDbUtils = provider.dbUtils
    const originalSearchIndex = provider.searchIndex
    const originalSearchIndexWorkerReady = provider.searchIndexWorkerReady
    const originalEmbeddingService = provider.embeddingService
    const originalSearchIndexWorker = provider.searchIndexWorker

    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tuff-file-provider-search-'))
    const precisePath = path.join(tempDir, 'repo.txt')
    const prefixPath = path.join(tempDir, 'reporter.txt')
    const ftsPath = path.join(tempDir, 'team-repo.txt')
    await Promise.all([
      fs.writeFile(precisePath, 'repo'),
      fs.writeFile(prefixPath, 'reporter'),
      fs.writeFile(ftsPath, 'team repo')
    ])

    const preciseFile = createFileSearchRow({
      id: 31,
      path: precisePath,
      name: 'repo.txt'
    })
    const prefixFile = createFileSearchRow({
      id: 32,
      path: prefixPath,
      name: 'reporter.txt'
    })
    const ftsFile = createFileSearchRow({
      id: 33,
      path: ftsPath,
      name: 'team-repo.txt'
    })
    const rowsByPath = new Map(
      [preciseFile, prefixFile, ftsFile].map((file) => [file.path, { file, extensions: {} }])
    )
    const whereMock = vi.fn(async () => Array.from(rowsByPath.values()))
    const leftJoinMock = vi.fn(() => ({ where: whereMock }))
    const fromMock = vi.fn(() => ({ leftJoin: leftJoinMock }))
    const selectMock = vi.fn(() => ({ from: fromMock }))
    const preciseDeferred =
      createDeferred<Map<string, Array<{ itemId: string; priority: number }>>>()
    const lookupByKeywordsMock = vi.fn(() => preciseDeferred.promise)
    const lookupByKeywordPrefixMock = vi.fn(async () => [
      { itemId: prefixFile.path, keyword: 'reporter', priority: 0.9 }
    ])
    const ftsSearchMock = vi.fn(async () => [{ itemId: ftsFile.path, score: 0.25 }])

    provider.dbUtils = {
      getDb: () => ({ select: selectMock })
    }
    provider.searchIndex = {
      lookupByKeywords: lookupByKeywordsMock,
      lookupByKeywordPrefix: lookupByKeywordPrefixMock,
      search: ftsSearchMock
    }
    provider.searchIndexWorkerReady = Promise.resolve(true)
    provider.searchIndexWorker = { removeProviderItems: searchIndexWorkerRemoveProviderItems }
    provider.embeddingService = null

    try {
      const resultPromise = provider.onSearch(
        { text: 'repo', inputs: [] },
        new AbortController().signal
      )

      expect(lookupByKeywordsMock).toHaveBeenCalledWith('file-provider', ['repo'], 200)
      expect(lookupByKeywordPrefixMock).toHaveBeenCalledWith('file-provider', 'repo', 200)
      expect(ftsSearchMock).toHaveBeenCalledWith('file-provider', 'repo', 150)
      expect(whereMock).not.toHaveBeenCalled()

      preciseDeferred.resolve(new Map([['repo', [{ itemId: preciseFile.path, priority: 1.2 }]]]))
      const result = await resultPromise

      const resultItems = result.items as TuffItem[]
      expect(resultItems.map((item) => item.id)).toEqual([
        preciseFile.path,
        prefixFile.path,
        ftsFile.path
      ])
      expect(resultItems.map((item) => item.meta?.extension?.search)).toEqual([
        { keywordMatch: true, ftsScore: 0, semanticScore: 0 },
        { keywordMatch: true, ftsScore: 0, semanticScore: 0 },
        { keywordMatch: false, ftsScore: 0.8, semanticScore: 0 }
      ])
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true })
      provider.dbUtils = originalDbUtils
      provider.searchIndex = originalSearchIndex
      provider.searchIndexWorkerReady = originalSearchIndexWorkerReady
      provider.embeddingService = originalEmbeddingService
      provider.searchIndexWorker = originalSearchIndexWorker
    }
  })

  it('returns immediately when aborted before file search work starts', async () => {
    const provider = fileProvider as unknown as FileProviderIndexingLifecycleTestApi
    const originalDbUtils = provider.dbUtils
    const originalSearchIndex = provider.searchIndex
    const originalSearchIndexWorkerReady = provider.searchIndexWorkerReady
    const originalEmbeddingService = provider.embeddingService

    const getDbMock = vi.fn(() => ({ select: vi.fn() }))
    const lookupByKeywordsMock = vi.fn()
    const lookupByKeywordPrefixMock = vi.fn()
    const ftsSearchMock = vi.fn()
    const controller = new AbortController()
    controller.abort()

    provider.dbUtils = { getDb: getDbMock }
    provider.searchIndex = {
      lookupByKeywords: lookupByKeywordsMock,
      lookupByKeywordPrefix: lookupByKeywordPrefixMock,
      search: ftsSearchMock
    }
    provider.searchIndexWorkerReady = Promise.resolve(true)
    provider.embeddingService = null

    try {
      const result = await provider.onSearch({ text: 'repo', inputs: [] }, controller.signal)

      expect(result.items).toEqual([])
      expect(getDbMock).not.toHaveBeenCalled()
      expect(lookupByKeywordsMock).not.toHaveBeenCalled()
      expect(lookupByKeywordPrefixMock).not.toHaveBeenCalled()
      expect(ftsSearchMock).not.toHaveBeenCalled()
    } finally {
      provider.dbUtils = originalDbUtils
      provider.searchIndex = originalSearchIndex
      provider.searchIndexWorkerReady = originalSearchIndexWorkerReady
      provider.embeddingService = originalEmbeddingService
    }
  })

  it('does not fetch file rows when aborted after search-index candidate reads', async () => {
    const provider = fileProvider as unknown as FileProviderIndexingLifecycleTestApi
    const originalDbUtils = provider.dbUtils
    const originalSearchIndex = provider.searchIndex
    const originalSearchIndexWorkerReady = provider.searchIndexWorkerReady
    const originalEmbeddingService = provider.embeddingService

    const controller = new AbortController()
    const selectMock = vi.fn(() => ({
      from: vi.fn(() => ({
        leftJoin: vi.fn(() => ({
          where: vi.fn(async () => [])
        }))
      }))
    }))
    const lookupByKeywordsMock = vi.fn(async () => {
      controller.abort()
      return new Map([['repo', [{ itemId: '/tmp/repo.txt', priority: 1 }]]])
    })
    const lookupByKeywordPrefixMock = vi.fn(async () => [])
    const ftsSearchMock = vi.fn(async () => [])

    provider.dbUtils = {
      getDb: () => ({ select: selectMock })
    }
    provider.searchIndex = {
      lookupByKeywords: lookupByKeywordsMock,
      lookupByKeywordPrefix: lookupByKeywordPrefixMock,
      search: ftsSearchMock
    }
    provider.searchIndexWorkerReady = Promise.resolve(true)
    provider.embeddingService = null

    try {
      const result = await provider.onSearch({ text: 'repo', inputs: [] }, controller.signal)

      expect(result.items).toEqual([])
      expect(lookupByKeywordsMock).toHaveBeenCalledWith('file-provider', ['repo'], 200)
      expect(lookupByKeywordPrefixMock).toHaveBeenCalledWith('file-provider', 'repo', 200)
      expect(ftsSearchMock).toHaveBeenCalledWith('file-provider', 'repo', 150)
      expect(selectMock).not.toHaveBeenCalled()
    } finally {
      provider.dbUtils = originalDbUtils
      provider.searchIndex = originalSearchIndex
      provider.searchIndexWorkerReady = originalSearchIndexWorkerReady
      provider.embeddingService = originalEmbeddingService
    }
  })

  it('does not build a File Index warming result notice while startup is pending', () => {
    const provider = fileProvider as unknown as MutableFileProvider
    resetProviderState(provider)
    provider.backgroundStartupPromise = Promise.resolve()

    const notice = provider.buildStartupDegradedNotice({ text: 'report', inputs: [] })

    expect(notice).toBeNull()
  })
})
