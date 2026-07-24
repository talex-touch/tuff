import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TuffItem } from '@talex-touch/utils'
import type { IndexedSourceResetReason } from '@talex-touch/utils/search'
import type { FilePersistencePort } from '../../search-engine/search-index-writer'
import { IndexedSourceResetReasons, IndexedSourceScanReasons } from '@talex-touch/utils/search'

const {
  transportOn,
  appTaskWaitForIdle,
  watchServiceInitialize,
  watchServiceEnsure,
  filePersistenceWaitUntilReady,
  filePersistencePersistEntries,
  filePersistenceUpsertFiles,
  filePersistenceUpsertScanProgress,
  filePersistenceRemoveFile,
  filePersistenceRemoveFileExtensions,
  filePersistenceGetStatus,
  filePersistenceHasPendingWork,
  filePersistenceDrain,
  runtimeApplyBatch,
  runtimeApplyDelta,
  runtimeCleanupSource,
  runtimeCountSource,
  runtimeDrainSource,
  runtimeScanSource,
  fileScanBatches
} = vi.hoisted(() => ({
  transportOn: vi.fn(),
  appTaskWaitForIdle: vi.fn(async () => true),
  watchServiceInitialize: vi.fn(),
  watchServiceEnsure: vi.fn(async () => undefined),
  filePersistenceWaitUntilReady: vi.fn(async () => undefined),
  filePersistencePersistEntries: vi.fn(async () => ({})),
  filePersistenceUpsertFiles: vi.fn(async () => []),
  filePersistenceUpsertScanProgress: vi.fn(async () => 0),
  filePersistenceRemoveFile: vi.fn(async () => undefined),
  filePersistenceRemoveFileExtensions: vi.fn(async () => undefined),
  filePersistenceGetStatus: vi.fn(async () => null),
  filePersistenceHasPendingWork: vi.fn(() => false),
  filePersistenceDrain: vi.fn(async () => undefined),
  runtimeApplyBatch: vi.fn<() => Promise<{ indexedItemCount?: number } | undefined>>(
    async () => undefined
  ),
  runtimeApplyDelta: vi.fn(async () => undefined),
  runtimeCleanupSource: vi.fn(async () => 0),
  runtimeCountSource: vi.fn(async () => 0),
  runtimeDrainSource: vi.fn(async () => undefined),
  runtimeScanSource: vi.fn(async () => undefined),
  fileScanBatches: vi.fn()
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
    schedule: vi.fn((_label: string, operation: () => Promise<unknown>) => operation()),
    waitForCapacity: vi.fn(async () => undefined)
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

vi.mock('./workers/file-reconcile-worker-client', () => ({
  FileReconcileWorkerClient: vi.fn(() => ({
    getStatus: vi.fn(async () => null),
    shutdown: vi.fn()
  }))
}))

vi.mock('./workers/file-scan-worker-client', () => ({
  FileScanWorkerClient: vi.fn(() => ({
    scanBatches: fileScanBatches,
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

import { fileProvider, resolveFileProviderBaseWatchPaths } from './file-provider'

interface MutableFileProvider {
  prepareForSearchIndexShutdown: () => Promise<void>
  isInitializing: Promise<unknown> | null
  shuttingDown: boolean
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
  setFilePersistencePort: (port: FilePersistencePort | null) => void
  setIndexedSourceRuntimeMutationDelegate: (delegate: unknown | null) => void
}

interface FileProviderShutdownTestApi extends MutableFileProvider {
  fileScanWorker: { shutdown: () => void }
  fileIndexWorker: { shutdown: () => void }
  reconcileWorker: { shutdown: () => void }
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

type FileProviderLeaseRecoveryTestApi = FileProviderIndexingLifecycleTestApi & {
  drainIndexedSourceMutations: (reason: string, mutationLeaseId?: string) => Promise<void>
  publishCommittedWorkerRecords: (entries: unknown[]) => Promise<number>
  indexSchedulerService: {
    drain: (timeoutMs?: number, mutationLeaseId?: string) => Promise<void>
    cancelLease: (mutationLeaseId: string) => void
  }
  fileIndexWorker: {
    cancelLease: (mutationLeaseId: string) => number
  }
  pendingIndexWorkerResults: Map<number, { mutationLeaseId?: string }>
  inflightIndexWorkerResults: Map<number, { mutationLeaseId?: string }>
  cancelledIndexWorkerMutationLeases: Set<string>
  resetIndexedSourceRuntimeState: (request: unknown) => Promise<unknown>
}

function createWorkerResult(fileId: number, mutationLeaseId: string) {
  return {
    type: 'file' as const,
    taskId: `task-${fileId}`,
    fileId,
    mutationLeaseId,
    fileUpdate: null,
    progress: {
      status: 'completed',
      progress: 1,
      startedAt: 1,
      updatedAt: 2,
      processedBytes: 1,
      totalBytes: 1,
      lastError: null
    },
    indexItem: {
      itemId: `/tmp/lease-${fileId}.txt`,
      providerId: 'file-provider',
      type: 'file',
      name: `lease-${fileId}.txt`,
      displayName: `Lease ${fileId}`,
      path: `/tmp/lease-${fileId}.txt`,
      extension: '.txt',
      keywords: [],
      tags: []
    }
  }
}

function createContext() {
  return {
    touchApp: { channel: {} },
    databaseManager: {
      getDb: () => ({}),
      getSearchDb: () => ({}),
      isSearchSplitEnabled: () => false,
      filePath: '/tmp/tuff-file-provider-db'
    },
    searchIndex: {}
  }
}

function createFilePersistencePort(): FilePersistencePort {
  return {
    waitUntilReady: filePersistenceWaitUntilReady,
    persistEntries: filePersistencePersistEntries,
    upsertFiles: filePersistenceUpsertFiles,
    upsertScanProgress: filePersistenceUpsertScanProgress,
    removeFile: filePersistenceRemoveFile,
    removeFileExtensions: filePersistenceRemoveFileExtensions,
    getStatus: filePersistenceGetStatus,
    hasPendingWork: filePersistenceHasPendingWork,
    drain: filePersistenceDrain
  } as unknown as FilePersistencePort
}

function installRuntimeDependencies(provider: FileProviderIndexingLifecycleTestApi): void {
  provider.setFilePersistencePort(createFilePersistencePort())
  provider.setIndexedSourceRuntimeMutationDelegate({
    applyBatch: runtimeApplyBatch,
    applyDelta: runtimeApplyDelta,
    cleanupSource: runtimeCleanupSource,
    countSource: runtimeCountSource,
    drainSource: runtimeDrainSource,
    scanSource: runtimeScanSource
  })
  provider.setIndexedSourceRuntimeResetDelegate(async (request) => ({
    sourceId: request.sourceId,
    reason: request.reason,
    clearedSearchIndex: request.clearSearchIndex === true,
    clearedScanProgress: request.clearScanProgress === true,
    scanProgressRows: 0,
    startedAt: 1,
    completedAt: 2
  }))
}

function resetProviderState(provider: MutableFileProvider): void {
  provider.backgroundStartupPromise = null
  provider.backgroundStartupReady = false
  provider.backgroundStartupError = null
  provider.isInitializing = null
  provider.shuttingDown = false
  provider.openersChannelRegistered = false
}

beforeEach(() => {
  installRuntimeDependencies(fileProvider as unknown as FileProviderIndexingLifecycleTestApi)
})

afterEach(() => {
  vi.useRealTimers()
  const provider = fileProvider as unknown as FileProviderIndexingLifecycleTestApi
  resetProviderState(provider)
  provider.setFilePersistencePort(null)
  provider.setIndexedSourceRuntimeMutationDelegate(null)
  provider.setIndexedSourceRuntimeResetDelegate(null)
  vi.clearAllMocks()
  appTaskWaitForIdle.mockResolvedValue(true)
  filePersistenceWaitUntilReady.mockResolvedValue(undefined)
  filePersistencePersistEntries.mockResolvedValue({})
  filePersistenceUpsertFiles.mockResolvedValue([])
  filePersistenceUpsertScanProgress.mockResolvedValue(0)
  filePersistenceRemoveFile.mockResolvedValue(undefined)
  filePersistenceRemoveFileExtensions.mockResolvedValue(undefined)
  filePersistenceGetStatus.mockResolvedValue(null)
  filePersistenceHasPendingWork.mockReturnValue(false)
  filePersistenceDrain.mockResolvedValue(undefined)
  runtimeApplyBatch.mockResolvedValue(undefined)
  runtimeApplyDelta.mockResolvedValue(undefined)
  runtimeCleanupSource.mockResolvedValue(0)
  runtimeCountSource.mockResolvedValue(0)
  runtimeDrainSource.mockResolvedValue(undefined)
  runtimeScanSource.mockResolvedValue(undefined)
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

    expect(transportOn).toHaveBeenCalledTimes(1)
    expect(filePersistenceWaitUntilReady).not.toHaveBeenCalled()
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

    expect(filePersistenceWaitUntilReady).toHaveBeenCalledTimes(1)
    expect(watchServiceInitialize).toHaveBeenCalledTimes(1)
    expect(watchServiceEnsure).toHaveBeenCalledTimes(1)
    expect(transportOn).toHaveBeenCalledTimes(1)
    expect(provider.getIndexingStatus()).toEqual(
      expect.objectContaining({
        startupReady: true,
        startupPending: false,
        startupError: null
      })
    )
  })

  it('waits for deferred startup and prevents post-shutdown worker or watcher initialization', async () => {
    const provider = fileProvider as unknown as FileProviderShutdownTestApi
    resetProviderState(provider)
    const idle = createDeferred<boolean>()
    const scanWorkerShutdown = vi.spyOn(provider.fileScanWorker, 'shutdown')
    const indexWorkerShutdown = vi.spyOn(provider.fileIndexWorker, 'shutdown')
    const reconcileWorkerShutdown = vi.spyOn(provider.reconcileWorker, 'shutdown')
    let startup: Promise<void> | null = null
    let prepare: Promise<void> | null = null

    appTaskWaitForIdle.mockReturnValueOnce(idle.promise)

    try {
      await provider.onLoad(createContext())
      await new Promise<void>((resolve) => setImmediate(resolve))
      startup = provider.backgroundStartupPromise

      expect(startup).not.toBeNull()
      expect(appTaskWaitForIdle).toHaveBeenCalledTimes(1)

      prepare = provider.prepareForSearchIndexShutdown()
      let prepareSettled = false
      void prepare.then(() => {
        prepareSettled = true
      })
      await new Promise<void>((resolve) => setImmediate(resolve))

      expect(prepareSettled).toBe(false)

      idle.resolve(true)
      await prepare

      expect(filePersistenceWaitUntilReady).not.toHaveBeenCalled()
      expect(watchServiceInitialize).not.toHaveBeenCalled()
      expect(watchServiceEnsure).not.toHaveBeenCalled()
      expect(scanWorkerShutdown).toHaveBeenCalledTimes(1)
      expect(indexWorkerShutdown).toHaveBeenCalledTimes(1)
      expect(reconcileWorkerShutdown).toHaveBeenCalledTimes(1)
    } finally {
      idle.resolve(true)
      await startup?.catch(() => undefined)
      await prepare?.catch(() => undefined)
      scanWorkerShutdown.mockRestore()
      indexWorkerShutdown.mockRestore()
      reconcileWorkerShutdown.mockRestore()
    }
  })

  it('bounds shutdown producer waits and succeeds on retry after indexing settles', async () => {
    vi.useFakeTimers()
    const provider = fileProvider as unknown as FileProviderShutdownTestApi
    const originalIsInitializing = provider.isInitializing
    const indexing = createDeferred<void>()
    const scanWorkerShutdown = vi.spyOn(provider.fileScanWorker, 'shutdown')
    const indexWorkerShutdown = vi.spyOn(provider.fileIndexWorker, 'shutdown')
    const reconcileWorkerShutdown = vi.spyOn(provider.reconcileWorker, 'shutdown')

    resetProviderState(provider)
    provider.isInitializing = indexing.promise

    try {
      const firstPrepare = provider.prepareForSearchIndexShutdown()
      const firstFailure = expect(firstPrepare).rejects.toThrow(
        'FILE_PROVIDER_SHUTDOWN_PRODUCER_TIMEOUT:indexing'
      )

      await vi.advanceTimersByTimeAsync(30_000)
      await firstFailure

      expect(scanWorkerShutdown).toHaveBeenCalledTimes(1)
      expect(indexWorkerShutdown).toHaveBeenCalledTimes(1)
      expect(reconcileWorkerShutdown).toHaveBeenCalledTimes(1)

      indexing.resolve(undefined)
      await expect(provider.prepareForSearchIndexShutdown()).resolves.toBeUndefined()

      expect(scanWorkerShutdown).toHaveBeenCalledTimes(2)
      expect(indexWorkerShutdown).toHaveBeenCalledTimes(2)
      expect(reconcileWorkerShutdown).toHaveBeenCalledTimes(2)
    } finally {
      indexing.resolve(undefined)
      provider.isInitializing = originalIsInitializing
      scanWorkerShutdown.mockRestore()
      indexWorkerShutdown.mockRestore()
      reconcileWorkerShutdown.mockRestore()
    }
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

  it('streams SchemaMigration file rows in bounded pages followed by one terminal batch', async () => {
    const provider = fileProvider as unknown as FileProviderIndexingLifecycleTestApi & {
      dbUtils: {
        getDb: () => {
          select: () => {
            from: () => {
              where: () => {
                orderBy: () => { limit: (count: number) => Promise<unknown[]> }
              }
            }
          }
        }
      } | null
      streamIndexedSourceSnapshot: (request: {
        sourceId: string
        reason: string
      }) => AsyncIterable<{ sourceId: string; records: unknown[]; done?: boolean }>
    }
    const originalDbUtils = provider.dbUtils
    const firstPage = Array.from({ length: 100 }, (_, index) => ({
      id: index + 1,
      path: `/tmp/${index + 1}.txt`,
      name: `${index + 1}.txt`,
      displayName: null,
      extension: '.txt',
      size: index + 1,
      mtime: new Date(1_000 + index),
      type: 'file',
      isDir: false
    }))
    const secondPage = [
      {
        id: 101,
        path: '/tmp/101.txt',
        name: '101.txt',
        displayName: null,
        extension: '.txt',
        size: 101,
        mtime: new Date(1_101),
        type: 'file',
        isDir: false
      }
    ]
    const limit = vi
      .fn<(count: number) => Promise<unknown[]>>()
      .mockResolvedValueOnce(firstPage)
      .mockResolvedValueOnce(secondPage)
      .mockResolvedValueOnce([])
    provider.dbUtils = {
      getDb: () => ({
        select: () => ({
          from: () => ({
            where: () => ({ orderBy: () => ({ limit }) })
          })
        })
      })
    }

    try {
      const batches: Array<{ sourceId: string; records: unknown[]; done?: boolean }> = []
      for await (const batch of provider.streamIndexedSourceSnapshot({
        sourceId: 'file-provider',
        reason: IndexedSourceScanReasons.SchemaMigration
      })) {
        batches.push(batch)
      }

      expect(batches.map((batch) => ({ records: batch.records.length, done: batch.done }))).toEqual(
        [
          { records: 100, done: undefined },
          { records: 1, done: undefined },
          { records: 0, done: true }
        ]
      )
      expect(limit).toHaveBeenCalledTimes(3)
      expect(limit).toHaveBeenCalledWith(100)
    } finally {
      provider.dbUtils = originalDbUtils
    }
  })
  it('falls back to direct scanning only when the worker fails before its first batch', async () => {
    const provider = fileProvider as unknown as {
      scanDirectoryBatchesWithWorker: (
        path: string,
        excludePaths?: Set<string>
      ) => AsyncIterable<Array<{ path: string }>>
      scanDirectoryBatchesDirectStream: (
        path: string,
        excludePaths?: Set<string>
      ) => AsyncIterable<Array<{ path: string }>>
    }
    const originalDirect = provider.scanDirectoryBatchesDirectStream
    const direct = vi.fn(async function* () {
      yield [{ path: '/tmp/direct.txt' }]
    })
    provider.scanDirectoryBatchesDirectStream = direct
    fileScanBatches.mockImplementation(async function* () {
      throw new Error('worker unavailable')
    })

    try {
      const batches: Array<Array<{ path: string }>> = []
      for await (const batch of provider.scanDirectoryBatchesWithWorker('/tmp')) batches.push(batch)

      expect(batches).toEqual([[{ path: '/tmp/direct.txt' }]])
      expect(direct).toHaveBeenCalledWith('/tmp', undefined, undefined)
    } finally {
      provider.scanDirectoryBatchesDirectStream = originalDirect
      fileScanBatches.mockReset()
    }
  })

  it('propagates a worker failure after a yielded batch without replaying direct scan data', async () => {
    const provider = fileProvider as unknown as {
      scanDirectoryBatchesWithWorker: (path: string) => AsyncIterable<Array<{ path: string }>>
      scanDirectoryBatchesDirectStream: (path: string) => AsyncIterable<Array<{ path: string }>>
    }
    const originalDirect = provider.scanDirectoryBatchesDirectStream
    const direct = vi.fn(async function* () {
      yield [{ path: '/tmp/direct.txt' }]
    })
    provider.scanDirectoryBatchesDirectStream = direct
    fileScanBatches.mockImplementation(async function* () {
      yield [{ path: '/tmp/worker.txt' }]
      throw new Error('worker failed after batch')
    })

    try {
      const iterator = provider.scanDirectoryBatchesWithWorker('/tmp')[Symbol.asyncIterator]()
      await expect(iterator.next()).resolves.toEqual({
        value: [{ path: '/tmp/worker.txt' }],
        done: false
      })
      await expect(iterator.next()).rejects.toThrow('worker failed after batch')
      expect(direct).not.toHaveBeenCalled()
    } finally {
      provider.scanDirectoryBatchesDirectStream = originalDirect
      fileScanBatches.mockReset()
    }
  })

  it('closes the worker stream when a direct consumer throws after its first batch', async () => {
    const provider = fileProvider as unknown as {
      scanDirectoryBatchesWithWorker: (path: string) => AsyncIterable<Array<{ path: string }>>
    }
    let workerClosed = false
    fileScanBatches.mockImplementation(async function* () {
      try {
        yield [{ path: '/tmp/worker.txt' }]
        await new Promise<void>(() => {})
      } finally {
        workerClosed = true
      }
    })

    try {
      const iterator = provider.scanDirectoryBatchesWithWorker('/tmp')[Symbol.asyncIterator]()
      await expect(iterator.next()).resolves.toMatchObject({ value: [{ path: '/tmp/worker.txt' }] })
      const consumerError = new Error('consumer failed')
      await expect(iterator.throw?.(consumerError)).rejects.toBe(consumerError)
      expect(workerClosed).toBe(true)
    } finally {
      fileScanBatches.mockReset()
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
    } finally {
      provider.ensureFileSystemWatchers = originalEnsureFileSystemWatchers
      provider.startIndexing = originalStartIndexing
    }
  })

  it('reports integrity mismatch without mutating Runtime state', async () => {
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

      expect(resetDelegate).not.toHaveBeenCalled()
      expect(provider.lastIntegritySnapshot).toMatchObject({
        needsRebuild: true,
        clearedSearchIndex: false,
        clearedScanProgress: false
      })
    } finally {
      provider.countSearchIndexByProvider = originalCountSearchIndexByProvider
      provider.setIndexedSourceRuntimeResetDelegate(null)
    }
  })

  it('routes manual rebuild reset and scan through Runtime delegates', async () => {
    const provider = fileProvider as unknown as FileProviderIndexingLifecycleTestApi
    const originalIsInitializing = provider.isInitializing
    const originalInitializationContext = provider.initializationContext
    const originalDbUtils = provider.dbUtils
    const originalGetBatteryLevel = provider.getBatteryLevel
    const originalEnsureFileSystemWatchers = provider.ensureFileSystemWatchers
    const resetDelegate = vi.fn(async () => ({
      sourceId: 'file-provider',
      reason: IndexedSourceResetReasons.ManualRebuild,
      clearedSearchIndex: true,
      clearedScanProgress: true,
      scanProgressRows: 2,
      startedAt: 1,
      completedAt: 2
    }))

    provider.isInitializing = null
    provider.initializationContext = createContext()
    provider.dbUtils = { getDb: () => ({}) }
    provider.getBatteryLevel = vi.fn(async () => null)
    provider.ensureFileSystemWatchers = vi.fn(async () => undefined)
    provider.setIndexedSourceRuntimeResetDelegate(resetDelegate)

    try {
      await expect(provider.rebuildIndex({ force: true })).resolves.toMatchObject({ success: true })

      expect(resetDelegate).toHaveBeenCalledWith({
        sourceId: 'file-provider',
        reason: IndexedSourceResetReasons.ManualRebuild,
        clearScanProgress: true,
        clearSearchIndex: true
      })
      expect(runtimeScanSource).toHaveBeenCalledWith(IndexedSourceScanReasons.ManualRebuild)
    } finally {
      provider.isInitializing = originalIsInitializing
      provider.initializationContext = originalInitializationContext
      provider.dbUtils = originalDbUtils
      provider.getBatteryLevel = originalGetBatteryLevel
      provider.ensureFileSystemWatchers = originalEnsureFileSystemWatchers
      provider.setIndexedSourceRuntimeResetDelegate(null)
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
        isDir: false,
        runtimePublication: 'base'
      },
      keywords: ['markdown', 'document', 'note'],
      tags: ['text', 'document', 'code', 'md'],
      search: {
        keywords: [
          { value: 'markdown', priority: 1.05 },
          { value: 'document', priority: 1.05 },
          { value: 'note', priority: 1.05 }
        ]
      }
    })
  })

  it('returns concrete watch deltas for runtime store updates', async () => {
    const provider = fileProvider as unknown as FileProviderIndexingLifecycleTestApi
    const originalIsWithinWatchRoots = provider.isWithinWatchRoots
    const originalBuildFileRecord = provider.buildFileRecord
    const originalDbUtils = provider.dbUtils
    const mtime = new Date('2026-05-30T00:00:00.000Z')
    const selectWhere = vi.fn(async () => [{ id: 42, path: '/Users/demo/Documents/a.md' }])
    const deleteWhere = vi.fn(async () => undefined)
    const updateWhere = vi.fn(async () => undefined)
    const db = {
      select: vi.fn(() => ({ from: vi.fn(() => ({ where: selectWhere })) })),
      delete: vi.fn(() => ({ where: deleteWhere })),
      update: vi.fn(() => ({ set: vi.fn(() => ({ where: updateWhere })) }))
    }

    provider.isWithinWatchRoots = vi.fn(() => true)
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
    provider.dbUtils = { getDb: () => db }

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
    } finally {
      provider.isWithinWatchRoots = originalIsWithinWatchRoots
      provider.buildFileRecord = originalBuildFileRecord
      provider.dbUtils = originalDbUtils
    }
  })

  it('ignores watch events outside configured roots', async () => {
    const provider = fileProvider as unknown as FileProviderIndexingLifecycleTestApi
    const originalIsWithinWatchRoots = provider.isWithinWatchRoots

    provider.isWithinWatchRoots = vi.fn(() => false)

    try {
      await expect(
        provider.handleIndexedSourceWatchEvent({
          sourceId: 'file-provider',
          action: 'change',
          path: '/tmp/outside.md',
          occurredAt: 1700000000000
        })
      ).resolves.toEqual([])
    } finally {
      provider.isWithinWatchRoots = originalIsWithinWatchRoots
    }
  })

  it('keeps startup degraded when file persistence cannot initialize', async () => {
    const provider = fileProvider as unknown as MutableFileProvider
    resetProviderState(provider)
    filePersistenceWaitUntilReady.mockRejectedValueOnce(new Error('worker unavailable'))

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

  it('returns stale searches before applying provider-scoped Runtime cleanup deltas', async () => {
    const provider = fileProvider as unknown as FileProviderIndexingLifecycleTestApi
    const originalDbUtils = provider.dbUtils
    const originalSearchIndex = provider.searchIndex
    const originalEmbeddingService = provider.embeddingService
    const stalePath = '/Users/demo/Documents/stale-report.pdf'
    const whereMock = vi.fn(async () => [])
    const selectMock = vi.fn(() => ({
      from: vi.fn(() => ({ leftJoin: vi.fn(() => ({ where: whereMock })) }))
    }))
    const cleanup = createDeferred<undefined>()

    provider.dbUtils = { getDb: () => ({ select: selectMock }) }
    provider.searchIndex = {
      lookupByKeywords: vi.fn(
        async () => new Map([['report', [{ itemId: stalePath, priority: 100 }]]])
      ),
      lookupByKeywordPrefix: vi.fn(async () => []),
      search: vi.fn(async () => [])
    }
    provider.embeddingService = null
    filePersistenceRemoveFile.mockReturnValueOnce(cleanup.promise)

    let cleanupReleased = false
    try {
      const resultPromise = provider.onSearch(
        { text: 'report', inputs: [] },
        new AbortController().signal
      )

      await vi.waitFor(() => expect(filePersistenceRemoveFile).toHaveBeenCalledWith(stalePath))
      const settled = await resultPromise

      expect(settled.items).toEqual([])
      expect(runtimeApplyDelta).not.toHaveBeenCalled()

      cleanupReleased = true
      cleanup.resolve(undefined)
      await cleanup.promise
      await vi.waitFor(() =>
        expect(runtimeApplyDelta).toHaveBeenCalledWith({
          sourceId: 'file-provider',
          action: 'delete',
          stableKey: stalePath,
          path: stalePath,
          reason: 'search.remove-stale-candidates'
        })
      )
    } finally {
      if (!cleanupReleased) {
        cleanup.resolve(undefined)
        await cleanup.promise
      }
      provider.dbUtils = originalDbUtils
      provider.searchIndex = originalSearchIndex
      provider.embeddingService = originalEmbeddingService
    }
  })

  it('starts precise, prefix, and FTS file search-index reads in parallel before precise resolves', async () => {
    const provider = fileProvider as unknown as FileProviderIndexingLifecycleTestApi
    const originalDbUtils = provider.dbUtils
    const originalSearchIndex = provider.searchIndex
    const originalEmbeddingService = provider.embeddingService

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
      provider.embeddingService = originalEmbeddingService
    }
  })

  it('returns immediately when aborted before file search work starts', async () => {
    const provider = fileProvider as unknown as FileProviderIndexingLifecycleTestApi
    const originalDbUtils = provider.dbUtils
    const originalSearchIndex = provider.searchIndex
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
      provider.embeddingService = originalEmbeddingService
    }
  })

  it('does not fetch file rows when aborted after search-index candidate reads', async () => {
    const provider = fileProvider as unknown as FileProviderIndexingLifecycleTestApi
    const originalDbUtils = provider.dbUtils
    const originalSearchIndex = provider.searchIndex
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
      provider.embeddingService = originalEmbeddingService
    }
  })

  it('cancels a timed-out lease, waits its active dispatch, and drops its late worker publication', async () => {
    const provider = fileProvider as unknown as FileProviderLeaseRecoveryTestApi
    const originalScheduler = provider.indexSchedulerService
    const originalWorker = provider.fileIndexWorker
    const originalReset = provider.resetIndexedSourceRuntimeState
    const originalPending = provider.pendingIndexWorkerResults
    const originalInflight = provider.inflightIndexWorkerResults
    const originalCancelledLeases = provider.cancelledIndexWorkerMutationLeases
    const activeDispatchSettled = createDeferred<void>()
    const cancellationBegan = createDeferred<void>()
    const timeout = new Error('lease A drain timed out')
    const events: string[] = []
    const reset = vi.fn(async () => {
      events.push('reset-progress')
      return { clearedScanProgress: true }
    })

    provider.indexSchedulerService = {
      drain: vi
        .fn()
        .mockRejectedValueOnce(timeout)
        .mockImplementationOnce(async () => {
          cancellationBegan.resolve(undefined)
          await activeDispatchSettled.promise
        }),
      cancelLease: vi.fn((leaseId: string) => events.push(`scheduler-cancel:${leaseId}`))
    } as unknown as typeof provider.indexSchedulerService
    provider.fileIndexWorker = {
      cancelLease: vi.fn((leaseId: string) => {
        events.push(`worker-cancel:${leaseId}`)
        return 1
      })
    } as unknown as typeof provider.fileIndexWorker
    provider.resetIndexedSourceRuntimeState = reset
    provider.pendingIndexWorkerResults = new Map([
      [1, { mutationLeaseId: 'lease-A' }],
      [2, { mutationLeaseId: 'lease-B' }]
    ])
    provider.inflightIndexWorkerResults = new Map([
      [3, { mutationLeaseId: 'lease-A' }],
      [4, { mutationLeaseId: 'lease-B' }]
    ])
    provider.cancelledIndexWorkerMutationLeases = new Set()

    try {
      const drain = provider.drainIndexedSourceMutations('indexed-source.scan', 'lease-A')
      await cancellationBegan.promise

      expect(events).toEqual(['scheduler-cancel:lease-A', 'worker-cancel:lease-A'])
      expect(reset).not.toHaveBeenCalled()
      expect(provider.cancelledIndexWorkerMutationLeases.has('lease-A')).toBe(true)

      activeDispatchSettled.resolve(undefined)
      events.push('active-dispatch-settled')
      await expect(drain).rejects.toBe(timeout)

      expect(events).toEqual([
        'scheduler-cancel:lease-A',
        'worker-cancel:lease-A',
        'active-dispatch-settled',
        'reset-progress'
      ])
      expect(reset).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceId: 'file-provider',
          clearSearchIndex: false,
          clearScanProgress: true
        })
      )
      expect(provider.pendingIndexWorkerResults.has(1)).toBe(false)
      expect(provider.inflightIndexWorkerResults.has(3)).toBe(false)
      expect(provider.pendingIndexWorkerResults.get(2)).toEqual({ mutationLeaseId: 'lease-B' })
      expect(provider.inflightIndexWorkerResults.get(4)).toEqual({ mutationLeaseId: 'lease-B' })

      await expect(
        provider.publishCommittedWorkerRecords([createWorkerResult(1, 'lease-A')])
      ).resolves.toBe(0)
      expect(runtimeApplyBatch).not.toHaveBeenCalled()
    } finally {
      provider.indexSchedulerService = originalScheduler
      provider.fileIndexWorker = originalWorker
      provider.resetIndexedSourceRuntimeState = originalReset
      provider.pendingIndexWorkerResults = originalPending
      provider.inflightIndexWorkerResults = originalInflight
      provider.cancelledIndexWorkerMutationLeases = originalCancelledLeases
    }
  })

  it('drops only cancelled worker publication groups while applying healthy leases', async () => {
    const provider = fileProvider as unknown as FileProviderLeaseRecoveryTestApi
    const originalCancelledLeases = provider.cancelledIndexWorkerMutationLeases
    provider.cancelledIndexWorkerMutationLeases = new Set(['lease-A'])
    runtimeApplyBatch.mockResolvedValue({ indexedItemCount: 1 })

    try {
      await expect(
        provider.publishCommittedWorkerRecords([
          createWorkerResult(1, 'lease-A'),
          createWorkerResult(2, 'lease-B')
        ])
      ).resolves.toBe(1)

      expect(runtimeApplyBatch).toHaveBeenCalledTimes(1)
      expect(runtimeApplyBatch).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceId: 'file-provider',
          mutationLeaseId: 'lease-B',
          records: [expect.objectContaining({ recordId: '/tmp/lease-2.txt' })]
        })
      )
    } finally {
      provider.cancelledIndexWorkerMutationLeases = originalCancelledLeases
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
