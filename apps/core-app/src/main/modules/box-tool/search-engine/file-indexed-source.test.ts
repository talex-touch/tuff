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
      progress: {
        stage: 'idle'
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

  it('yields FileProvider scan batches to the runtime store boundary', async () => {
    const source = buildFileIndexedSource()
    const request = {
      sourceId: 'file-provider',
      reason: IndexedSourceScanReasons.Scheduled
    }
    const scanBatch: IndexedSourceRecordBatch = {
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
      ],
      done: true
    }
    fileProviderMock.scanIndexedSource.mockResolvedValue({
      batches: [scanBatch]
    })

    const batches: IndexedSourceRecordBatch[] = []
    for await (const batch of source.scan(request)) {
      batches.push(batch)
    }

    expect(batches).toEqual([scanBatch])
    expect(fileProviderMock.scanIndexedSource).toHaveBeenCalledWith(request)
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

  it('uses FileProvider rebuild for clearIndex and reports failures', async () => {
    const source = buildFileIndexedSource()

    await source.clearIndex?.()
    expect(fileProviderMock.rebuildIndex).toHaveBeenCalledWith({ force: true })

    fileProviderMock.rebuildIndex.mockResolvedValueOnce({
      success: false,
      reason: 'missing-context',
      error: 'Cannot rebuild'
    })

    await expect(source.clearIndex?.()).rejects.toThrow('Cannot rebuild')
  })
})
