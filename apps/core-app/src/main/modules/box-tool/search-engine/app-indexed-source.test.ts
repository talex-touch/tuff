import type { IndexedSourceRecordBatch } from '@talex-touch/utils/search'
import { IndexedSourceScanReasons, isIndexedSourceAdmissionReady } from '@talex-touch/utils/search'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildAppIndexedSource, buildAppIndexedSourceDescriptor } from './app-indexed-source'

const appProviderMock = vi.hoisted(() => ({
  getIndexedSourceHealth: vi.fn(),
  getIndexedSourceRoots: vi.fn(),
  getIndexedSourceEvidence: vi.fn(),
  scanIndexedSource: vi.fn(),
  reconcileIndexedSource: vi.fn(),
  handleIndexedSourceWatchEvent: vi.fn(),
  rebuildIndex: vi.fn()
}))

vi.mock('../addon/apps/app-provider', () => ({
  appProvider: appProviderMock
}))

describe('appIndexedSource', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    appProviderMock.getIndexedSourceHealth.mockResolvedValue({
      status: 'ready',
      permissionState: 'not-required',
      itemCount: 2,
      watchState: 'active',
      reconcileState: 'idle'
    })
    appProviderMock.getIndexedSourceRoots.mockReturnValue([
      {
        sourceId: 'app-provider',
        path: '/Applications',
        permissionState: 'not-required',
        watchDepth: 1
      }
    ])
    appProviderMock.getIndexedSourceEvidence.mockResolvedValue([
      {
        id: 'app-provider:macos-mdfind',
        label: 'macOS mdfind applications',
        status: 'ready',
        itemCount: 2
      }
    ])
    appProviderMock.scanIndexedSource.mockResolvedValue(null)
    appProviderMock.reconcileIndexedSource.mockResolvedValue({
      sourceId: 'app-provider',
      added: 0,
      changed: 0,
      deleted: 0,
      skipped: 0,
      errors: 0,
      startedAt: 1,
      completedAt: 2,
      reason: 'full-sync'
    })
    appProviderMock.handleIndexedSourceWatchEvent.mockResolvedValue([
      {
        sourceId: 'app-provider',
        action: 'change',
        path: '/Applications/App.app',
        reason: 'app-provider-watch-event'
      }
    ])
    appProviderMock.rebuildIndex.mockResolvedValue({ success: true })
  })

  it('describes Applications as a core app indexed source', () => {
    expect(buildAppIndexedSourceDescriptor()).toMatchObject({
      id: 'app-provider',
      kind: 'app',
      priority: 'fast',
      storage: 'sqlite-index',
      admission: {
        owner: 'core',
        permissionScopes: ['none'],
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
    expect(isIndexedSourceAdmissionReady(buildAppIndexedSourceDescriptor())).toBe(true)
  })

  it('delegates health, roots and evidence to AppProvider', async () => {
    const source = buildAppIndexedSource()

    await expect(source.getHealth()).resolves.toMatchObject({ status: 'ready', itemCount: 2 })
    await expect(source.getRoots()).resolves.toHaveLength(1)
    await expect(source.getEvidence?.()).resolves.toEqual([
      expect.objectContaining({
        id: 'app-provider:macos-mdfind',
        itemCount: 2
      })
    ])
  })

  it('yields AppProvider scan batches to the runtime store boundary', async () => {
    const source = buildAppIndexedSource()
    const request = {
      sourceId: 'app-provider',
      reason: IndexedSourceScanReasons.Startup
    }
    const scanBatch: IndexedSourceRecordBatch = {
      sourceId: 'app-provider',
      records: [
        {
          sourceId: 'app-provider',
          recordId: 'app-1',
          stableKey: 'app-1',
          kind: 'app',
          title: 'Example App',
          path: '/Applications/Example.app'
        }
      ],
      done: true
    }
    appProviderMock.scanIndexedSource.mockResolvedValue(scanBatch)

    const batches: IndexedSourceRecordBatch[] = []
    for await (const batch of source.scan(request)) {
      batches.push(batch)
    }

    expect(batches).toEqual([scanBatch])
    expect(appProviderMock.scanIndexedSource).toHaveBeenCalledWith(request)
  })

  it('delegates reconcile and watch lifecycle to AppProvider', async () => {
    const source = buildAppIndexedSource()
    const reconcileRequest = { sourceId: 'app-provider', limit: 10 }
    const watchEvent = {
      sourceId: 'app-provider',
      action: 'change' as const,
      path: '/Applications/App.app',
      occurredAt: 1700000000000
    }

    await expect(source.reconcile?.(reconcileRequest)).resolves.toMatchObject({
      sourceId: 'app-provider',
      reason: 'full-sync'
    })
    await expect(source.handleWatchEvent?.(watchEvent)).resolves.toHaveLength(1)

    expect(appProviderMock.reconcileIndexedSource).toHaveBeenCalledWith(reconcileRequest)
    expect(appProviderMock.handleIndexedSourceWatchEvent).toHaveBeenCalledWith(watchEvent)
  })

  it('uses AppProvider rebuild for clearIndex', async () => {
    const source = buildAppIndexedSource()

    await source.clearIndex?.()

    expect(appProviderMock.rebuildIndex).toHaveBeenCalledTimes(1)
  })
})
