import type { IndexedSourceRecordBatch } from '@talex-touch/utils/search'
import {
  IndexedSourceResetReasons,
  IndexedSourceScanReasons,
  isIndexedSourceAdmissionReady
} from '@talex-touch/utils/search'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildFileIndexedSource, buildFileIndexedSourceDescriptor } from './file-indexed-source'

const fileProviderMock = vi.hoisted(() => ({
  getIndexingStatus: vi.fn(),
  getIndexStats: vi.fn(),
  getIndexedSourceEvidence: vi.fn(),
  getWatchedPaths: vi.fn(),
  getPendingWatchPermissionPaths: vi.fn(),
  ownsWatchPath: vi.fn(),
  scanIndexedSource: vi.fn(),
  streamIndexedSourceSnapshot: vi.fn(),
  drainIndexedSourceMutations: vi.fn(),
  reconcileIndexedSource: vi.fn(),
  handleIndexedSourceWatchEvent: vi.fn(),
  resetIndexedSourceRuntimeState: vi.fn(),
  rebuildIndex: vi.fn()
}))

vi.mock('../addon/files/file-provider', () => ({
  fileProvider: fileProviderMock
}))

describe('fileIndexedSource', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    fileProviderMock.getIndexingStatus.mockReturnValue({
      isInitializing: false,
      startupPending: false,
      startupReady: true,
      initializationFailed: false,
      error: null,
      startupError: null,
      startTime: 1700000000000,
      estimatedCompletion: 1700000005000,
      estimatedRemainingMs: 5000,
      averageItemsPerSecond: 2,
      estimateStatus: 'estimated',
      speedSampleCount: 2,
      estimateBasis: 'stage-speed',
      progress: {
        stage: 'idle',
        current: 0,
        total: 0
      }
    })
    fileProviderMock.getIndexStats.mockResolvedValue({
      totalFiles: 12
    })
    fileProviderMock.getIndexedSourceEvidence.mockResolvedValue([
      {
        id: 'file-provider:scan-progress',
        label: 'File scan progress',
        status: 'ready',
        itemCount: 12
      }
    ])
    fileProviderMock.getWatchedPaths.mockReturnValue(['/Users/demo/Documents'])
    fileProviderMock.getPendingWatchPermissionPaths.mockReturnValue([])
    fileProviderMock.ownsWatchPath.mockReturnValue(true)
    fileProviderMock.scanIndexedSource.mockResolvedValue(null)
    fileProviderMock.streamIndexedSourceSnapshot.mockImplementation(async function* () {})
    fileProviderMock.drainIndexedSourceMutations.mockResolvedValue(undefined)
    fileProviderMock.reconcileIndexedSource.mockResolvedValue({
      sourceId: 'file-provider',
      added: 0,
      changed: 1,
      deleted: 0,
      skipped: 0,
      errors: 0,
      startedAt: 1,
      completedAt: 2,
      reason: 'file-index-reconciliation'
    })
    fileProviderMock.handleIndexedSourceWatchEvent.mockResolvedValue([
      {
        sourceId: 'file-provider',
        action: 'change',
        path: '/Users/demo/Documents/a.md',
        reason: 'file-provider-watch-event'
      }
    ])
    fileProviderMock.resetIndexedSourceRuntimeState.mockResolvedValue({
      sourceId: 'file-provider',
      reason: IndexedSourceResetReasons.HealthRepair,
      clearedSearchIndex: false,
      clearedScanProgress: true,
      scanProgressRows: 2,
      startedAt: 1,
      completedAt: 2
    })
    fileProviderMock.rebuildIndex.mockResolvedValue({ success: true })
  })

  it('describes File Index as a deferred indexed source', () => {
    expect(buildFileIndexedSourceDescriptor()).toMatchObject({
      id: 'file-provider',
      kind: 'file',
      priority: 'deferred',
      storage: 'sqlite-index',
      admission: {
        owner: 'core',
        permissionScopes: ['file-system'],
        defaultState: 'enabled',
        clearable: true,
        rebuildable: true
      },
      capabilities: {
        scan: true,
        watch: true,
        reconcile: true,
        clear: true,
        open: true
      }
    })
    expect(isIndexedSourceAdmissionReady(buildFileIndexedSourceDescriptor())).toBe(true)
  })

  it('maps FileProvider status into indexed source health, roots, and evidence', async () => {
    const source = buildFileIndexedSource()

    await expect(source.getHealth()).resolves.toMatchObject({
      status: 'ready',
      itemCount: 12,
      watchState: 'active',
      reconcileState: 'idle'
    })
    await expect(source.getRoots()).resolves.toEqual([
      {
        sourceId: 'file-provider',
        path: '/Users/demo/Documents',
        permissionState: 'granted'
      }
    ])
    await expect(source.getEvidence?.()).resolves.toEqual([
      expect.objectContaining({
        id: 'file-provider:scan-progress',
        status: 'ready',
        itemCount: 12
      })
    ])
  })

  it('exposes FileProvider index flush evidence through indexed source diagnostics', async () => {
    fileProviderMock.getIndexedSourceEvidence.mockResolvedValueOnce([
      {
        id: 'file-provider:index-flush',
        label: 'File index flush',
        status: 'degraded',
        itemCount: 3,
        lastCheckedAt: 1700000000000,
        reason: 'worker-not-ready',
        metadata: {
          status: 'worker-not-ready',
          entries: 1,
          pending: 3,
          inflight: 0,
          durationMs: 12,
          error: 'worker unavailable'
        }
      }
    ])

    const source = buildFileIndexedSource()

    await expect(source.getEvidence?.()).resolves.toEqual([
      expect.objectContaining({
        id: 'file-provider:index-flush',
        label: 'File index flush',
        status: 'degraded',
        itemCount: 3,
        lastCheckedAt: 1700000000000,
        reason: 'worker-not-ready',
        metadata: expect.objectContaining({
          status: 'worker-not-ready',
          entries: 1,
          pending: 3,
          inflight: 0,
          durationMs: 12,
          error: 'worker unavailable'
        })
      })
    ])
  })

  it('exposes FileProvider progress through indexed source diagnostics progress', async () => {
    fileProviderMock.getIndexingStatus.mockReturnValue({
      isInitializing: true,
      startupPending: false,
      startupReady: true,
      initializationFailed: false,
      error: null,
      startupError: null,
      startTime: 1700000000000,
      estimatedCompletion: 1700000010000,
      estimatedRemainingMs: 10000,
      averageItemsPerSecond: 10,
      estimateStatus: 'estimated',
      speedSampleCount: 3,
      estimateBasis: 'stage-speed',
      progress: {
        stage: 'indexing',
        current: 40,
        total: 100
      }
    })
    const source = buildFileIndexedSource()

    await expect(source.getProgress?.()).resolves.toMatchObject({
      sourceId: 'file-provider',
      stage: 'indexing',
      status: 'estimated',
      current: 40,
      total: 100,
      progress: 40,
      startedAt: 1700000000000,
      estimatedRemainingMs: 10000,
      estimatedCompletionAt: 1700000010000,
      averageItemsPerSecond: 10,
      speedSampleCount: 3,
      estimateBasis: 'stage-speed'
    })
  })

  it('maps pending watch permission paths into source health and roots', async () => {
    fileProviderMock.getWatchedPaths.mockReturnValue([
      '/Users/demo/Documents',
      '/Users/demo/Secret'
    ])
    fileProviderMock.getPendingWatchPermissionPaths.mockReturnValue(['/Users/demo/Secret'])
    const source = buildFileIndexedSource()

    await expect(source.getHealth()).resolves.toMatchObject({
      status: 'permission-required',
      permissionState: 'promptable',
      watchState: 'pending-permission',
      reason: 'file-index-watch-root-pending-permission'
    })
    await expect(source.getRoots()).resolves.toEqual([
      {
        sourceId: 'file-provider',
        path: '/Users/demo/Documents',
        permissionState: 'granted',
        reason: undefined
      },
      {
        sourceId: 'file-provider',
        path: '/Users/demo/Secret',
        permissionState: 'promptable',
        reason: 'file-index-watch-root-pending-permission'
      }
    ])
  })

  it('streams the first committed FileProvider batch before the scan completes', async () => {
    const source = buildFileIndexedSource()
    const request = {
      sourceId: 'file-provider',
      reason: IndexedSourceScanReasons.Scheduled
    }
    const firstBatch: IndexedSourceRecordBatch = {
      sourceId: 'file-provider',
      records: [
        {
          sourceId: 'file-provider',
          recordId: '/Users/demo/Documents/a.md',
          stableKey: '/Users/demo/Documents/a.md',
          kind: 'file',
          title: 'a.md',
          path: '/Users/demo/Documents/a.md'
        }
      ]
    }
    const secondBatch: IndexedSourceRecordBatch = {
      sourceId: 'file-provider',
      records: [],
      done: true
    }
    const finishScan = Promise.withResolvers<void>()
    fileProviderMock.scanIndexedSource.mockImplementation(
      async (
        _request: unknown,
        options: { onRecordBatch: (batch: IndexedSourceRecordBatch) => Promise<void> }
      ) => {
        await options.onRecordBatch(firstBatch)
        await finishScan.promise
        await options.onRecordBatch(secondBatch)
        return { batches: [] }
      }
    )

    const iterator = source.scan(request)[Symbol.asyncIterator]()
    await expect(iterator.next()).resolves.toEqual({ value: firstBatch, done: false })
    expect(fileProviderMock.scanIndexedSource).toHaveBeenCalledWith(
      expect.objectContaining({ sourceId: 'file-provider' }),
      expect.objectContaining({ throwOnFailure: true })
    )

    finishScan.resolve()
    await expect(iterator.next()).resolves.toEqual({ value: secondBatch, done: false })
    await expect(iterator.next()).resolves.toEqual({ value: undefined, done: true })
  })

  it('aborts and settles the FileProvider producer when a consumer returns early', async () => {
    const source = buildFileIndexedSource()
    const request = { sourceId: 'file-provider', reason: IndexedSourceScanReasons.Scheduled }
    const batch: IndexedSourceRecordBatch = { sourceId: 'file-provider', records: [] }
    let producerSignal: AbortSignal | undefined
    fileProviderMock.scanIndexedSource.mockImplementation(
      async (
        providerRequest: { signal?: AbortSignal },
        options: { onRecordBatch: (batch: IndexedSourceRecordBatch) => Promise<void> }
      ) => {
        producerSignal = providerRequest.signal
        await options.onRecordBatch(batch)
        await new Promise<void>((resolve) =>
          producerSignal?.addEventListener('abort', () => resolve(), { once: true })
        )
        return { batches: [] }
      }
    )

    const iterator = source.scan(request)[Symbol.asyncIterator]()
    await expect(iterator.next()).resolves.toEqual({ value: batch, done: false })
    await expect(iterator.return?.()).resolves.toEqual({ value: undefined, done: true })
    expect(producerSignal?.aborted).toBe(true)
  })

  it('propagates a FileProvider scan failure without yielding a terminal batch', async () => {
    const source = buildFileIndexedSource()
    const scanError = new Error('file scan failed')
    fileProviderMock.scanIndexedSource.mockRejectedValue(scanError)

    const iterator = source
      .scan({ sourceId: 'file-provider', reason: IndexedSourceScanReasons.Scheduled })
      [Symbol.asyncIterator]()

    await expect(iterator.next()).rejects.toThrow('file scan failed')
  })

  it('replays every FileProvider SchemaMigration snapshot batch without starting a scan', async () => {
    const source = buildFileIndexedSource()
    const request = {
      sourceId: 'file-provider',
      reason: IndexedSourceScanReasons.SchemaMigration
    }
    const firstBatch: IndexedSourceRecordBatch = {
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
    const doneBatch: IndexedSourceRecordBatch = {
      sourceId: 'file-provider',
      records: [],
      done: true
    }
    fileProviderMock.streamIndexedSourceSnapshot.mockImplementation(async function* () {
      yield firstBatch
      yield doneBatch
    })

    const batches: IndexedSourceRecordBatch[] = []
    for await (const batch of source.scan(request)) {
      batches.push(batch)
    }

    expect(batches).toEqual([firstBatch, doneBatch])
    expect(fileProviderMock.streamIndexedSourceSnapshot).toHaveBeenCalledWith(request)
    expect(fileProviderMock.scanIndexedSource).not.toHaveBeenCalled()
  })

  it('delegates reconcile and watch lifecycle to FileProvider', async () => {
    const source = buildFileIndexedSource()
    const reconcileRequest = { sourceId: 'file-provider', limit: 10 }
    const watchEvent = {
      sourceId: 'file-provider',
      action: 'change' as const,
      path: '/Users/demo/Documents/a.md',
      occurredAt: 1700000000000
    }

    await expect(source.reconcile?.(reconcileRequest)).resolves.toMatchObject({
      sourceId: 'file-provider',
      changed: 1
    })
    await expect(source.handleWatchEvent?.(watchEvent)).resolves.toHaveLength(1)

    expect(fileProviderMock.reconcileIndexedSource).toHaveBeenCalledWith(reconcileRequest)
    expect(fileProviderMock.handleIndexedSourceWatchEvent).toHaveBeenCalledWith(watchEvent)
  })

  it('checks whether watch events belong to FileProvider roots', () => {
    fileProviderMock.ownsWatchPath.mockReturnValueOnce(true).mockReturnValueOnce(false)
    const source = buildFileIndexedSource()

    expect(
      source.shouldHandleWatchEvent?.({
        sourceId: 'file-provider',
        action: 'change',
        path: '/Users/demo/Documents',
        occurredAt: 1700000000000
      })
    ).toBe(true)
    expect(
      source.shouldHandleWatchEvent?.({
        sourceId: 'file-provider',
        action: 'change',
        path: '/Applications',
        occurredAt: 1700000000000
      })
    ).toBe(false)
    expect(fileProviderMock.ownsWatchPath).toHaveBeenCalledWith('/Users/demo/Documents')
    expect(fileProviderMock.ownsWatchPath).toHaveBeenCalledWith('/Applications')
  })
  it('delegates source mutation drain with the scheduler lease', async () => {
    const source = buildFileIndexedSource()

    await expect(
      source.drainMutations?.({ leaseId: 'file-provider:0:1', reason: 'scan' })
    ).resolves.toBeUndefined()

    expect(fileProviderMock.drainIndexedSourceMutations).toHaveBeenCalledWith(
      'indexed-source.scan',
      'file-provider:0:1'
    )
  })

  it('delegates runtime reset lifecycle to FileProvider', async () => {
    const source = buildFileIndexedSource()
    const request = {
      sourceId: 'file-provider',
      reason: IndexedSourceResetReasons.HealthRepair,
      clearScanProgress: true
    }

    await expect(source.resetIndex?.(request)).resolves.toMatchObject({
      sourceId: 'file-provider',
      reason: IndexedSourceResetReasons.HealthRepair,
      clearedScanProgress: true,
      scanProgressRows: 2
    })

    expect(fileProviderMock.resetIndexedSourceRuntimeState).toHaveBeenCalledWith(request)
  })

  it('uses FileProvider runtime reset for clearIndex and reports scan progress cleanup', async () => {
    const source = buildFileIndexedSource()
    fileProviderMock.resetIndexedSourceRuntimeState.mockResolvedValueOnce({
      sourceId: 'file-provider',
      reason: IndexedSourceResetReasons.UserClear,
      clearedSearchIndex: true,
      clearedScanProgress: true,
      scanProgressRows: 4,
      startedAt: 3,
      completedAt: 4
    })

    await expect(source.clearIndex?.()).resolves.toMatchObject({
      sourceId: 'file-provider',
      reason: IndexedSourceResetReasons.UserClear,
      clearedSearchIndex: true,
      clearedScanProgress: true,
      scanProgressRows: 4
    })
    expect(fileProviderMock.resetIndexedSourceRuntimeState).toHaveBeenCalledWith({
      sourceId: 'file-provider',
      reason: IndexedSourceResetReasons.UserClear,
      clearSearchIndex: true,
      clearScanProgress: true
    })
    expect(fileProviderMock.rebuildIndex).not.toHaveBeenCalled()
  })
})
