import type {
  IndexedSource,
  IndexedSourceDelta,
  IndexedSourceDescriptor,
  IndexedSourceHealth,
  IndexedSourceRecordBatch,
  IndexedSourceRoot
} from '@talex-touch/utils/search'
import type { IndexStoreAdapter } from './indexing-store-adapter'
import {
  IndexedSourceReconcileReasons,
  IndexedSourceResetReasons,
  IndexedSourceScanReasons
} from '@talex-touch/utils/search'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { IndexingRootPolicy } from './indexing-root-policy'
import { IndexingRuntime } from './indexing-runtime'

const loggerMock = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
  error: vi.fn()
}))

vi.mock('@talex-touch/utils/common/logger', () => ({
  getLogger: () => loggerMock
}))

const descriptor: IndexedSourceDescriptor = {
  id: 'test-source',
  kind: 'file',
  displayName: 'Test Source',
  platforms: ['darwin', 'win32', 'linux'],
  priority: 'deferred',
  storage: 'sqlite-index',
  privacy: 'low',
  capabilities: {
    scan: true,
    watch: true,
    reconcile: true,
    clear: true,
    open: true
  },
  admission: {
    owner: 'core',
    permissionScopes: ['file-system'],
    defaultState: 'enabled',
    clearable: true,
    rebuildable: true
  }
}

const readyHealth: IndexedSourceHealth = {
  status: 'ready',
  permissionState: 'granted',
  itemCount: 12,
  watchState: 'active',
  reconcileState: 'idle',
  lastIndexedAt: 1700000000000
}

function buildSource(
  overrides: Partial<IndexedSource> & {
    descriptor?: IndexedSourceDescriptor
    health?: IndexedSourceHealth
    roots?: IndexedSourceRoot[]
  } = {}
): IndexedSource {
  const sourceDescriptor = overrides.descriptor ?? descriptor
  const roots =
    overrides.roots ??
    ([
      {
        sourceId: sourceDescriptor.id,
        path: '/tmp/tuff-source',
        permissionState: 'granted',
        watchDepth: 2
      }
    ] satisfies IndexedSourceRoot[])

  return {
    descriptor: sourceDescriptor,
    getHealth: async () => overrides.health ?? readyHealth,
    getRoots: async () => roots,
    async *scan() {},
    ...overrides
  }
}

describe('indexingRuntime', () => {
  let runtime: IndexingRuntime
  let store: {
    applyBatch: ReturnType<typeof vi.fn>
    applyDelta: ReturnType<typeof vi.fn>
    clearSource: ReturnType<typeof vi.fn>
  }

  beforeEach(() => {
    vi.clearAllMocks()
    store = {
      applyBatch: vi.fn(async () => {}),
      applyDelta: vi.fn(async () => {}),
      clearSource: vi.fn(async () => {})
    }
    runtime = new IndexingRuntime({ store: store as IndexStoreAdapter })
  })

  it('registers sources once and returns descriptors', () => {
    const source = buildSource()

    expect(runtime.registerSource(source)).toBe(true)
    expect(runtime.registerSource(source)).toBe(false)
    expect(runtime.listDescriptors()).toEqual([descriptor])
  })

  it('warns when descriptor capabilities do not match source handlers', () => {
    runtime.registerSource(buildSource())

    expect(loggerMock.warn).toHaveBeenCalledWith(
      "Indexed source 'test-source' has lifecycle contract issues",
      {
        meta: {
          issues:
            'watch-capability-missing-handler, reconcile-capability-missing-handler, clear-capability-missing-handler, open-capability-missing-handler'
        }
      }
    )
  })

  it('warns when descriptor admission policy is not ready', () => {
    runtime.registerSource(
      buildSource({
        descriptor: {
          ...descriptor,
          id: 'unsafe-browser-bookmarks',
          kind: 'browser-bookmark',
          privacy: 'high',
          admission: {
            owner: 'official-plugin',
            permissionScopes: ['browser-data', 'file-system'],
            defaultState: 'enabled',
            requiresUserConsent: false,
            clearable: true,
            rebuildable: true
          }
        }
      })
    )

    expect(loggerMock.warn).toHaveBeenCalledWith(
      "Indexed source 'unsafe-browser-bookmarks' has admission contract issues",
      {
        meta: {
          issues: 'high-privacy-requires-explicit-enable'
        }
      }
    )
  })

  it('aggregates source health diagnostics', async () => {
    runtime.registerSource(buildSource())
    runtime.registerSource(
      buildSource({
        descriptor: { ...descriptor, id: 'browser-bookmarks', kind: 'browser-bookmark' },
        health: {
          status: 'degraded',
          permissionState: 'promptable',
          itemCount: 0,
          watchState: 'pending-permission',
          reconcileState: 'scheduled',
          reason: 'Bookmarks file not found'
        }
      })
    )

    const diagnostics = await runtime.getDiagnostics()

    expect(diagnostics.summary.total).toBe(2)
    expect(diagnostics.summary.ready).toBe(1)
    expect(diagnostics.summary.degraded).toBe(1)
    expect(diagnostics.summary.byStatus.ready).toBe(1)
    expect(diagnostics.sources.map((source) => source.descriptor.id)).toEqual([
      'test-source',
      'browser-bookmarks'
    ])
    expect(diagnostics.sources[0].lifecycleIssues).toEqual([
      'watch-capability-missing-handler',
      'reconcile-capability-missing-handler',
      'clear-capability-missing-handler',
      'open-capability-missing-handler'
    ])
    expect(diagnostics.sources[0].admissionIssues).toEqual([])
  })

  it('exposes source admission issues in diagnostics', async () => {
    runtime.registerSource(
      buildSource({
        descriptor: {
          ...descriptor,
          id: 'unsafe-browser-bookmarks',
          kind: 'browser-bookmark',
          privacy: 'high',
          admission: {
            owner: 'third-party-plugin',
            permissionScopes: ['browser-data'],
            defaultState: 'enabled',
            requiresUserConsent: false,
            clearable: true,
            rebuildable: true
          }
        }
      })
    )

    const diagnostics = await runtime.getDiagnostics()

    expect(diagnostics.sources[0].admissionIssues).toEqual([
      'high-privacy-requires-explicit-enable',
      'browser-data-requires-official-plugin'
    ])
  })

  it('aggregates optional source evidence diagnostics', async () => {
    runtime.registerSource(
      buildSource({
        getEvidence: async () => [
          {
            id: 'test-source:sub-source',
            label: 'Sub source',
            status: 'ready',
            itemCount: 3
          }
        ]
      })
    )

    const diagnostics = await runtime.getDiagnostics()

    expect(diagnostics.sources[0].evidence).toEqual([
      expect.objectContaining({
        id: 'test-source:sub-source',
        itemCount: 3
      })
    ])
  })

  it('aggregates optional source progress diagnostics', async () => {
    runtime.registerSource(
      buildSource({
        getProgress: async () => ({
          sourceId: 'test-source',
          stage: 'indexing',
          status: 'estimated',
          current: 20,
          total: 100,
          progress: 20,
          startedAt: 1,
          updatedAt: 2,
          estimatedRemainingMs: 4000,
          estimatedCompletionAt: 6000,
          averageItemsPerSecond: 20,
          speedSampleCount: 2,
          estimateBasis: 'stage-speed'
        })
      })
    )

    const diagnostics = await runtime.getDiagnostics()

    expect(diagnostics.sources[0].progress).toMatchObject({
      sourceId: 'test-source',
      stage: 'indexing',
      status: 'estimated',
      progress: 20,
      estimatedRemainingMs: 4000,
      estimateBasis: 'stage-speed'
    })
  })

  it('updates root policy from source diagnostics', async () => {
    const rootPolicy = new IndexingRootPolicy()
    runtime = new IndexingRuntime({ store: store as IndexStoreAdapter, rootPolicy })
    runtime.registerSource(
      buildSource({
        descriptor: { ...descriptor, id: 'file-provider' },
        roots: [
          {
            sourceId: 'file-provider',
            path: '/tmp/files',
            permissionState: 'granted'
          }
        ]
      })
    )

    await runtime.getDiagnostics()

    expect(rootPolicy.resolveFileSearchRoots().roots).toEqual([
      expect.objectContaining({
        sourceId: 'file-provider',
        path: '/tmp/files'
      })
    ])
  })

  it('converts health failures into source-level error diagnostics', async () => {
    runtime.registerSource(
      buildSource({
        getHealth: async () => {
          throw new Error('health failed')
        }
      })
    )

    const diagnostics = await runtime.getDiagnostics()

    expect(diagnostics.summary.unavailable).toBe(1)
    expect(diagnostics.sources[0].health.status).toBe('error')
    expect(diagnostics.sources[0].health.lastError).toBe('health failed')
  })

  it('routes watch events by source id when provided', async () => {
    const handleWatchEvent = vi.fn(async () => [
      { sourceId: 'test-source', action: 'change' as const, path: '/tmp/tuff-source/a.txt' }
    ])
    runtime.registerSource(buildSource({ handleWatchEvent }))

    const deltas = await runtime.routeWatchEvent({
      sourceId: 'test-source',
      action: 'change',
      path: '/tmp/tuff-source/a.txt',
      occurredAt: 1700000000000
    })

    expect(handleWatchEvent).toHaveBeenCalledTimes(1)
    expect(deltas).toHaveLength(1)
  })

  it('skips source-id watch routing when the source ownership filter rejects the path', async () => {
    const handleWatchEvent = vi.fn(async () => [
      { sourceId: 'test-source', action: 'change' as const, path: '/tmp/tuff-source/a.txt' }
    ])
    runtime.registerSource(
      buildSource({
        handleWatchEvent,
        shouldHandleWatchEvent: (event) => event.path.startsWith('/tmp/tuff-source/')
      })
    )

    const result = await runtime.routeWatchEventWithResult({
      sourceId: 'test-source',
      action: 'change',
      path: '/Applications/App.app',
      occurredAt: 1700000000000
    })

    expect(handleWatchEvent).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      matchedSources: 1,
      handledSources: 0,
      skippedSources: 1,
      skipped: [
        {
          sourceId: 'test-source',
          reason: 'source-watch-filtered'
        }
      ],
      deltas: []
    })
  })

  it('skips watch routing for disabled or admission-invalid sources', async () => {
    const handleWatchEvent = vi.fn(async () => [
      {
        sourceId: 'disabled-browser-bookmarks',
        action: 'change' as const,
        path: '/browser/Bookmarks'
      }
    ])
    runtime.registerSource(
      buildSource({
        descriptor: {
          ...descriptor,
          id: 'disabled-browser-bookmarks',
          kind: 'browser-bookmark',
          privacy: 'high',
          admission: {
            owner: 'official-plugin',
            permissionScopes: ['browser-data', 'file-system'],
            defaultState: 'disabled',
            requiresUserConsent: true,
            clearable: true,
            rebuildable: true
          }
        },
        health: {
          status: 'disabled',
          permissionState: 'promptable',
          itemCount: 0,
          watchState: 'pending-permission',
          reconcileState: 'idle'
        },
        roots: [
          {
            sourceId: 'disabled-browser-bookmarks',
            path: '/browser',
            permissionState: 'promptable'
          }
        ],
        handleWatchEvent
      })
    )

    const result = await runtime.routeWatchEventWithResult({
      sourceId: 'disabled-browser-bookmarks',
      action: 'change',
      path: '/browser/Default/Bookmarks',
      occurredAt: 1700000000000
    })

    expect(handleWatchEvent).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      matchedSources: 1,
      handledSources: 0,
      skippedSources: 1,
      skipped: [
        {
          sourceId: 'disabled-browser-bookmarks',
          reason: 'health:disabled'
        }
      ],
      deltas: []
    })

    const diagnostics = await runtime.getDiagnostics()
    expect(
      diagnostics.sources.find((source) => source.descriptor.id === 'disabled-browser-bookmarks')
    ).toMatchObject({
      lastWatch: {
        action: 'change',
        path: '/browser/Default/Bookmarks',
        jobId: 'disabled-browser-bookmarks:watch:1',
        queuedAt: expect.any(Number),
        deltas: 0,
        appliedDeltas: 0,
        failedDeltas: 0,
        error: 'skipped:health:disabled'
      }
    })
  })

  it('routes root-matched watch events only to matching sources', async () => {
    const fileWatch = vi.fn(async () => [
      { sourceId: 'files', action: 'change' as const, path: '/tmp/files/report.md' }
    ])
    const appWatch = vi.fn(async () => [
      { sourceId: 'apps', action: 'change' as const, path: '/Applications/App.app' }
    ])

    runtime.registerSource(
      buildSource({
        descriptor: { ...descriptor, id: 'files' },
        roots: [{ sourceId: 'files', path: '/tmp/files', permissionState: 'granted' }],
        handleWatchEvent: fileWatch
      })
    )
    runtime.registerSource(
      buildSource({
        descriptor: { ...descriptor, id: 'apps', kind: 'app' },
        roots: [{ sourceId: 'apps', path: '/Applications', permissionState: 'granted' }],
        handleWatchEvent: appWatch
      })
    )

    const deltas = await runtime.routeWatchEvent({
      action: 'change',
      path: '/tmp/files/report.md',
      occurredAt: 1700000000000
    })

    expect(fileWatch).toHaveBeenCalledTimes(1)
    expect(appWatch).not.toHaveBeenCalled()
    expect(deltas[0].sourceId).toBe('files')
  })

  it('skips root-matched watch events when the matched root is not granted', async () => {
    const handleWatchEvent = vi.fn(async () => [
      { sourceId: 'restricted-files', action: 'change' as const, path: '/restricted/report.md' }
    ])
    runtime.registerSource(
      buildSource({
        descriptor: { ...descriptor, id: 'restricted-files' },
        roots: [
          {
            sourceId: 'restricted-files',
            path: '/restricted',
            permissionState: 'denied'
          }
        ],
        handleWatchEvent
      })
    )

    const result = await runtime.routeWatchEventWithResult({
      action: 'change',
      path: '/restricted/report.md',
      occurredAt: 1700000000000
    })

    expect(handleWatchEvent).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      matchedSources: 1,
      handledSources: 0,
      skippedSources: 1,
      skipped: [
        {
          sourceId: 'restricted-files',
          reason: 'root-permission:denied'
        }
      ],
      deltas: []
    })

    const diagnostics = await runtime.getDiagnostics()
    expect(
      diagnostics.sources.find((source) => source.descriptor.id === 'restricted-files')
    ).toMatchObject({
      lastWatch: {
        path: '/restricted/report.md',
        jobId: 'restricted-files:watch:1',
        queuedAt: expect.any(Number),
        error: 'skipped:root-permission:denied'
      }
    })
  })

  it('applies watch deltas through the index store adapter', async () => {
    const delta: IndexedSourceDelta = {
      sourceId: 'test-source',
      action: 'change',
      path: '/tmp/tuff-source/a.txt'
    }
    runtime.registerSource(
      buildSource({
        handleWatchEvent: vi.fn(async () => [delta])
      })
    )

    await runtime.routeWatchEvent({
      sourceId: 'test-source',
      action: 'change',
      path: '/tmp/tuff-source/a.txt',
      occurredAt: 1700000000000
    })

    expect(store.applyDelta).toHaveBeenCalledWith(delta)
  })

  it('isolates failing watch handlers and still applies healthy source deltas', async () => {
    const delta: IndexedSourceDelta = {
      sourceId: 'files',
      action: 'change',
      path: '/tmp/shared/report.md'
    }
    runtime.registerSource(
      buildSource({
        descriptor: { ...descriptor, id: 'files' },
        roots: [{ sourceId: 'files', path: '/tmp/shared', permissionState: 'granted' }],
        handleWatchEvent: vi.fn(async () => [delta])
      })
    )
    runtime.registerSource(
      buildSource({
        descriptor: { ...descriptor, id: 'broken' },
        roots: [{ sourceId: 'broken', path: '/tmp/shared', permissionState: 'granted' }],
        handleWatchEvent: vi.fn(async () => {
          throw new Error('watch failed')
        })
      })
    )

    const result = await runtime.routeWatchEventWithResult({
      action: 'change',
      path: '/tmp/shared/report.md',
      occurredAt: 1700000000000
    })

    expect(result).toMatchObject({
      matchedSources: 2,
      handledSources: 1,
      failedSources: 1,
      appliedDeltas: 1,
      failedDeltas: 0,
      deltas: [delta],
      errors: [
        {
          sourceId: 'broken',
          phase: 'handle',
          message: 'watch failed'
        }
      ]
    })
    expect(store.applyDelta).toHaveBeenCalledWith(delta)
  })

  it('reports store delta failures without failing the entire watch route', async () => {
    const firstDelta: IndexedSourceDelta = {
      sourceId: 'test-source',
      action: 'change',
      path: '/tmp/tuff-source/a.txt'
    }
    const secondDelta: IndexedSourceDelta = {
      sourceId: 'test-source',
      action: 'change',
      path: '/tmp/tuff-source/b.txt'
    }
    store.applyDelta.mockImplementation(async (delta: IndexedSourceDelta) => {
      if (delta.path === secondDelta.path) {
        throw new Error('store failed')
      }
    })
    runtime.registerSource(
      buildSource({
        handleWatchEvent: vi.fn(async () => [firstDelta, secondDelta])
      })
    )

    const result = await runtime.routeWatchEventWithResult({
      sourceId: 'test-source',
      action: 'change',
      path: '/tmp/tuff-source/a.txt',
      occurredAt: 1700000000000
    })

    expect(result).toMatchObject({
      matchedSources: 1,
      handledSources: 1,
      failedSources: 0,
      appliedDeltas: 1,
      failedDeltas: 1,
      errors: [
        {
          phase: 'store',
          message: 'store failed'
        }
      ]
    })
    expect(result.deltas).toEqual([firstDelta, secondDelta])
  })

  it('runs source scans through the scan scheduler and stores batches', async () => {
    const batch: IndexedSourceRecordBatch = {
      sourceId: 'test-source',
      records: [
        {
          sourceId: 'test-source',
          recordId: 'record-1',
          stableKey: 'record-1',
          kind: 'file',
          title: 'Record 1'
        }
      ],
      done: true
    }
    runtime.registerSource(
      buildSource({
        async *scan() {
          yield batch
        }
      })
    )

    const result = await runtime.scanSource('test-source', IndexedSourceScanReasons.ManualRebuild)

    expect(result).toMatchObject({
      sourceId: 'test-source',
      batches: 1,
      records: 1
    })
    expect(store.applyBatch).toHaveBeenCalledWith(batch)
    const diagnostics = await runtime.getDiagnostics()
    expect(diagnostics.sources[0].lastScan).toMatchObject({
      jobId: 'test-source:scan:1',
      queuedAt: expect.any(Number),
      batches: 1,
      records: 1
    })
  })

  it('skips single source scans when runtime eligibility blocks the source', async () => {
    const scan = vi.fn(async function* () {})
    runtime.registerSource(
      buildSource({
        health: {
          status: 'disabled',
          permissionState: 'promptable',
          itemCount: 0,
          watchState: 'pending-permission',
          reconcileState: 'idle'
        },
        scan
      })
    )

    const result = await runtime.scanSource('test-source', IndexedSourceScanReasons.ManualRebuild)

    expect(scan).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      sourceId: 'test-source',
      batches: 0,
      records: 0
    })
    const diagnostics = await runtime.getDiagnostics()
    expect(diagnostics.sources[0]).toMatchObject({
      lastScan: {
        batches: 0,
        records: 0,
        error: 'skipped:health:disabled'
      }
    })
  })

  it('isolates failing source scans in batch scan results', async () => {
    const batch: IndexedSourceRecordBatch = {
      sourceId: 'healthy',
      records: [
        {
          sourceId: 'healthy',
          recordId: 'record-1',
          stableKey: 'record-1',
          kind: 'file',
          title: 'Record 1'
        }
      ],
      done: true
    }
    runtime.registerSource(
      buildSource({
        descriptor: { ...descriptor, id: 'healthy' },
        async *scan() {
          yield batch
        }
      })
    )
    runtime.registerSource(
      buildSource({
        descriptor: { ...descriptor, id: 'broken' },
        async *scan() {
          throw new Error('scan failed')
        }
      })
    )

    const result = await runtime.scanSourcesWithResult(IndexedSourceScanReasons.Scheduled)

    expect(result).toMatchObject({
      totalSources: 2,
      scannedSources: 1,
      failedSources: 1,
      batches: 1,
      records: 1,
      errors: [
        {
          sourceId: 'broken',
          message: 'scan failed'
        }
      ]
    })
    expect(result.results).toHaveLength(1)
    expect(result.results[0]).toMatchObject({ sourceId: 'healthy', batches: 1, records: 1 })
    expect(store.applyBatch).toHaveBeenCalledWith(batch)
  })

  it('skips disabled or admission-invalid sources during batch scans', async () => {
    const scan = vi.fn(async function* () {})
    runtime.registerSource(
      buildSource({
        descriptor: { ...descriptor, id: 'healthy' },
        scan
      })
    )
    runtime.registerSource(
      buildSource({
        descriptor: {
          ...descriptor,
          id: 'disabled-browser-bookmarks',
          kind: 'browser-bookmark',
          privacy: 'high',
          admission: {
            owner: 'official-plugin',
            permissionScopes: ['browser-data', 'file-system'],
            defaultState: 'disabled',
            requiresUserConsent: true,
            clearable: true,
            rebuildable: true
          }
        },
        health: {
          status: 'disabled',
          permissionState: 'promptable',
          itemCount: 0,
          watchState: 'pending-permission',
          reconcileState: 'idle'
        },
        scan: vi.fn(async function* () {})
      })
    )
    runtime.registerSource(
      buildSource({
        descriptor: {
          ...descriptor,
          id: 'invalid-high-privacy',
          privacy: 'high',
          admission: {
            owner: 'core',
            permissionScopes: ['file-system'],
            defaultState: 'enabled',
            clearable: true,
            rebuildable: true
          }
        },
        scan: vi.fn(async function* () {})
      })
    )

    const result = await runtime.scanSourcesWithResult(IndexedSourceScanReasons.Scheduled)

    expect(scan).toHaveBeenCalledTimes(1)
    expect(result).toMatchObject({
      totalSources: 3,
      scannedSources: 1,
      skippedSources: 2,
      skipped: [
        {
          sourceId: 'disabled-browser-bookmarks',
          reason: 'health:disabled'
        },
        {
          sourceId: 'invalid-high-privacy',
          reason: 'admission:high-privacy-requires-explicit-enable'
        }
      ]
    })

    const diagnostics = await runtime.getDiagnostics()
    expect(
      diagnostics.sources.find((source) => source.descriptor.id === 'disabled-browser-bookmarks')
    ).toMatchObject({
      lastScan: {
        jobId: 'disabled-browser-bookmarks:scan:2',
        queuedAt: expect.any(Number),
        batches: 0,
        records: 0,
        error: 'skipped:health:disabled'
      }
    })
  })

  it('keeps scanSources compatibility by returning successful batch scan results', async () => {
    runtime.registerSource(
      buildSource({
        descriptor: { ...descriptor, id: 'healthy' },
        async *scan() {}
      })
    )
    runtime.registerSource(
      buildSource({
        descriptor: { ...descriptor, id: 'broken' },
        async *scan() {
          throw new Error('scan failed')
        }
      })
    )

    await expect(runtime.scanSources(IndexedSourceScanReasons.Scheduled)).resolves.toEqual([
      expect.objectContaining({ sourceId: 'healthy' })
    ])
  })

  it('routes future scan and watch writes through a replaced store adapter', async () => {
    const nextStore = {
      applyBatch: vi.fn(async () => {}),
      applyDelta: vi.fn(async () => {}),
      clearSource: vi.fn(async () => {})
    }
    const batch: IndexedSourceRecordBatch = {
      sourceId: 'test-source',
      records: [
        {
          sourceId: 'test-source',
          recordId: 'record-1',
          stableKey: 'record-1',
          kind: 'file',
          title: 'Record 1'
        }
      ],
      done: true
    }
    const delta: IndexedSourceDelta = {
      sourceId: 'test-source',
      action: 'change',
      path: '/tmp/tuff-source/a.txt'
    }
    runtime.registerSource(
      buildSource({
        async *scan() {
          yield batch
        },
        handleWatchEvent: vi.fn(async () => [delta])
      })
    )

    runtime.setStore(nextStore as IndexStoreAdapter)
    await runtime.scanSource('test-source', IndexedSourceScanReasons.ManualRebuild)
    await runtime.routeWatchEvent({
      sourceId: 'test-source',
      action: 'change',
      path: '/tmp/tuff-source/a.txt',
      occurredAt: 1700000000000
    })

    expect(store.applyBatch).not.toHaveBeenCalled()
    expect(store.applyDelta).not.toHaveBeenCalled()
    expect(nextStore.applyBatch).toHaveBeenCalledWith(batch)
    expect(nextStore.applyDelta).toHaveBeenCalledWith(delta)
  })

  it('runs reconcile tasks through the reconcile engine', async () => {
    const delta: IndexedSourceDelta = {
      sourceId: 'test-source',
      action: 'change',
      record: {
        sourceId: 'test-source',
        recordId: 'record-1',
        stableKey: 'record-1',
        kind: 'file',
        title: 'Record 1'
      }
    }
    const reconcile = vi.fn(async () => ({
      sourceId: 'test-source',
      added: 1,
      changed: 2,
      deleted: 3,
      skipped: 4,
      errors: 0,
      deltas: [delta],
      startedAt: 1700000000000,
      completedAt: 1700000000100
    }))
    runtime.registerSource(buildSource({ reconcile }))

    const result = await runtime.reconcileSource('test-source', { limit: 10 })

    expect(reconcile).toHaveBeenCalledWith({ sourceId: 'test-source', limit: 10 })
    expect(result.changed).toBe(2)
    expect(result.appliedDeltas).toBe(1)
    expect(store.applyDelta).toHaveBeenCalledWith(delta)
  })

  it('skips single source reconcile when runtime eligibility blocks the source', async () => {
    const reconcile = vi.fn(async () => ({
      sourceId: 'test-source',
      added: 0,
      changed: 1,
      deleted: 0,
      skipped: 0,
      errors: 0,
      startedAt: 1700000000000,
      completedAt: 1700000000100
    }))
    runtime.registerSource(
      buildSource({
        health: {
          status: 'permission-required',
          permissionState: 'denied',
          itemCount: 0,
          watchState: 'pending-permission',
          reconcileState: 'idle'
        },
        reconcile
      })
    )

    const result = await runtime.reconcileSource('test-source', {
      reason: IndexedSourceReconcileReasons.ManualRepair
    })

    expect(reconcile).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      sourceId: 'test-source',
      added: 0,
      changed: 0,
      deleted: 0,
      skipped: 1,
      errors: 0,
      reason: 'health:permission-required'
    })
    const diagnostics = await runtime.getDiagnostics()
    expect(diagnostics.sources[0]).toMatchObject({
      lastReconcile: {
        skipped: 1,
        errors: 0,
        error: 'skipped:health:permission-required'
      }
    })
  })

  it('keeps reconcile delta store failures isolated in diagnostics', async () => {
    const failedStore = {
      ...store,
      applyDelta: vi.fn(async () => {
        throw new Error('store failed')
      })
    }
    runtime = new IndexingRuntime({ store: failedStore as IndexStoreAdapter })
    runtime.registerSource(
      buildSource({
        reconcile: vi.fn(async () => ({
          sourceId: 'test-source',
          added: 0,
          changed: 1,
          deleted: 0,
          skipped: 0,
          errors: 0,
          deltas: [
            {
              sourceId: 'test-source',
              action: 'change',
              path: '/tmp/tuff-source/a.txt'
            } satisfies IndexedSourceDelta
          ],
          startedAt: 1700000000000,
          completedAt: 1700000000100
        }))
      })
    )

    const result = await runtime.reconcileSource('test-source')

    expect(result).toMatchObject({
      appliedDeltas: 0,
      failedDeltas: 1,
      deltaErrors: ['test-source:store failed']
    })

    const diagnostics = await runtime.getDiagnostics()
    expect(diagnostics.sources[0]).toMatchObject({
      lastReconcile: {
        changed: 1,
        deltas: 1,
        appliedDeltas: 0,
        failedDeltas: 1,
        error: 'test-source:store failed'
      }
    })
  })

  it('isolates failing source reconciles in batch reconcile results', async () => {
    runtime.registerSource(
      buildSource({
        descriptor: { ...descriptor, id: 'healthy' },
        reconcile: vi.fn(async () => ({
          sourceId: 'healthy',
          added: 1,
          changed: 2,
          deleted: 3,
          skipped: 4,
          errors: 5,
          startedAt: 1700000000000,
          completedAt: 1700000000100
        }))
      })
    )
    runtime.registerSource(
      buildSource({
        descriptor: { ...descriptor, id: 'broken' },
        reconcile: vi.fn(async () => {
          throw new Error('reconcile failed')
        })
      })
    )

    const result = await runtime.reconcileSourcesWithResult()

    expect(result).toMatchObject({
      totalSources: 2,
      reconciledSources: 1,
      failedSources: 1,
      added: 1,
      changed: 2,
      deleted: 3,
      skipped: 4,
      errors: 5,
      failures: [
        {
          sourceId: 'broken',
          message: 'reconcile failed'
        }
      ]
    })
    expect(result.results).toHaveLength(1)
    expect(result.results[0]).toMatchObject({ sourceId: 'healthy', changed: 2 })
  })

  it('skips disabled or admission-invalid sources during batch reconcile', async () => {
    const reconcile = vi.fn(async () => ({
      sourceId: 'healthy',
      added: 0,
      changed: 1,
      deleted: 0,
      skipped: 0,
      errors: 0,
      startedAt: 1700000000000,
      completedAt: 1700000000100
    }))
    runtime.registerSource(
      buildSource({
        descriptor: { ...descriptor, id: 'healthy' },
        reconcile
      })
    )
    runtime.registerSource(
      buildSource({
        descriptor: {
          ...descriptor,
          id: 'permission-required',
          admission: {
            owner: 'core',
            permissionScopes: ['file-system'],
            defaultState: 'enabled',
            clearable: true,
            rebuildable: true
          }
        },
        health: {
          status: 'permission-required',
          permissionState: 'denied',
          itemCount: 0,
          watchState: 'pending-permission',
          reconcileState: 'idle'
        },
        reconcile: vi.fn(async () => ({
          sourceId: 'permission-required',
          added: 0,
          changed: 0,
          deleted: 0,
          skipped: 0,
          errors: 0,
          startedAt: 1700000000000,
          completedAt: 1700000000100
        }))
      })
    )

    const result = await runtime.reconcileSourcesWithResult()

    expect(reconcile).toHaveBeenCalledTimes(1)
    expect(result).toMatchObject({
      totalSources: 2,
      reconciledSources: 1,
      skippedSources: 1,
      skippedDetails: [
        {
          sourceId: 'permission-required',
          reason: 'health:permission-required'
        }
      ]
    })

    const diagnostics = await runtime.getDiagnostics()
    expect(
      diagnostics.sources.find((source) => source.descriptor.id === 'permission-required')
    ).toMatchObject({
      lastReconcile: {
        skipped: 1,
        errors: 0,
        error: 'skipped:health:permission-required'
      }
    })
  })

  it('keeps reconcileSources compatibility by returning successful reconcile results', async () => {
    runtime.registerSource(
      buildSource({
        descriptor: { ...descriptor, id: 'healthy' },
        reconcile: vi.fn(async () => ({
          sourceId: 'healthy',
          added: 0,
          changed: 1,
          deleted: 0,
          skipped: 0,
          errors: 0,
          startedAt: 1700000000000,
          completedAt: 1700000000100
        }))
      })
    )
    runtime.registerSource(
      buildSource({
        descriptor: { ...descriptor, id: 'broken' },
        reconcile: vi.fn(async () => {
          throw new Error('reconcile failed')
        })
      })
    )

    await expect(runtime.reconcileSources()).resolves.toEqual([
      expect.objectContaining({ sourceId: 'healthy', changed: 1 })
    ])
  })

  it('runs source runtime reset and exposes reset state in diagnostics', async () => {
    const resetIndex = vi.fn(async () => ({
      sourceId: 'test-source',
      reason: IndexedSourceResetReasons.HealthRepair,
      clearedSearchIndex: false,
      clearedScanProgress: true,
      scanProgressRows: 3,
      startedAt: 1700000000000,
      completedAt: 1700000000100
    }))
    runtime.registerSource(buildSource({ resetIndex }))

    const result = await runtime.resetSourceRuntimeState('test-source', {
      reason: IndexedSourceResetReasons.HealthRepair,
      clearScanProgress: true
    })

    expect(resetIndex).toHaveBeenCalledWith({
      sourceId: 'test-source',
      reason: IndexedSourceResetReasons.HealthRepair,
      clearSearchIndex: false,
      clearScanProgress: true
    })
    expect(result).toMatchObject({
      sourceId: 'test-source',
      clearedScanProgress: true,
      scanProgressRows: 3
    })

    const diagnostics = await runtime.getDiagnostics()
    expect(diagnostics.sources[0]).toMatchObject({
      lastReset: {
        reason: IndexedSourceResetReasons.HealthRepair,
        jobId: 'test-source:reset:1',
        queuedAt: expect.any(Number),
        clearedSearchIndex: false,
        clearedScanProgress: true,
        scanProgressRows: 3
      }
    })
  })

  it('clears source search index at runtime reset boundary', async () => {
    const resetIndex = vi.fn(async () => ({
      sourceId: 'test-source',
      reason: IndexedSourceResetReasons.UserClear,
      clearedSearchIndex: false,
      clearedScanProgress: false,
      startedAt: 1700000000000,
      completedAt: 1700000000100
    }))
    runtime.registerSource(buildSource({ resetIndex }))

    const result = await runtime.resetSourceRuntimeState('test-source', {
      reason: IndexedSourceResetReasons.UserClear,
      clearSearchIndex: true
    })

    expect(store.clearSource).toHaveBeenCalledWith('test-source')
    expect(resetIndex).toHaveBeenCalledWith({
      sourceId: 'test-source',
      reason: IndexedSourceResetReasons.UserClear,
      clearSearchIndex: false
    })
    expect(result).toMatchObject({
      sourceId: 'test-source',
      reason: IndexedSourceResetReasons.UserClear,
      clearedSearchIndex: true,
      clearedScanProgress: false
    })

    const diagnostics = await runtime.getDiagnostics()
    expect(diagnostics.sources[0].lastReset).toMatchObject({
      jobId: 'test-source:reset:1',
      queuedAt: expect.any(Number)
    })
  })

  it('supports search-index-only reset for sources without local reset hook', async () => {
    runtime.registerSource(buildSource())

    const result = await runtime.resetSourceRuntimeState('test-source', {
      reason: IndexedSourceResetReasons.UserClear,
      clearSearchIndex: true
    })

    expect(store.clearSource).toHaveBeenCalledWith('test-source')
    expect(result).toMatchObject({
      sourceId: 'test-source',
      reason: IndexedSourceResetReasons.UserClear,
      clearedSearchIndex: true,
      clearedScanProgress: false,
      error: undefined
    })
  })

  it('reports unsupported source runtime reset without throwing', async () => {
    runtime.registerSource(buildSource())

    const result = await runtime.resetSourceRuntimeState('test-source', {
      reason: IndexedSourceResetReasons.HealthRepair
    })

    expect(result).toMatchObject({
      sourceId: 'test-source',
      reason: IndexedSourceResetReasons.HealthRepair,
      clearedSearchIndex: false,
      clearedScanProgress: false,
      error: 'reset-not-supported'
    })
  })

  it('exposes latest scan, watch, and reconcile task state in diagnostics', async () => {
    const batch: IndexedSourceRecordBatch = {
      sourceId: 'test-source',
      records: [
        {
          sourceId: 'test-source',
          recordId: 'record-1',
          stableKey: 'record-1',
          kind: 'file',
          title: 'Record 1'
        }
      ],
      done: true
    }
    const delta: IndexedSourceDelta = {
      sourceId: 'test-source',
      action: 'change',
      path: '/tmp/tuff-source/a.txt'
    }
    runtime.registerSource(
      buildSource({
        async *scan() {
          yield batch
        },
        handleWatchEvent: vi.fn(async () => [delta]),
        reconcile: vi.fn(async () => ({
          sourceId: 'test-source',
          added: 1,
          changed: 2,
          deleted: 3,
          skipped: 4,
          errors: 0,
          startedAt: 1700000000000,
          completedAt: 1700000000100
        }))
      })
    )

    await runtime.scanSource('test-source', IndexedSourceScanReasons.Scheduled)
    await runtime.routeWatchEvent({
      sourceId: 'test-source',
      action: 'change',
      path: '/tmp/tuff-source/a.txt',
      occurredAt: 1700000000200
    })
    await runtime.reconcileSource('test-source')

    const diagnostics = await runtime.getDiagnostics()
    expect(diagnostics.sources[0]).toMatchObject({
      lastScan: {
        jobId: 'test-source:scan:1',
        queuedAt: expect.any(Number),
        batches: 1,
        records: 1
      },
      lastWatch: {
        occurredAt: 1700000000200,
        jobId: 'test-source:watch:1',
        queuedAt: expect.any(Number),
        action: 'change',
        path: '/tmp/tuff-source/a.txt',
        deltas: 1,
        appliedDeltas: 1,
        failedDeltas: 0
      },
      lastReconcile: {
        added: 1,
        changed: 2,
        deleted: 3,
        skipped: 4,
        errors: 0
      }
    })
    expect(diagnostics.sources[0].recentTasks).toMatchObject([
      {
        kind: 'reconcile',
        status: 'succeeded',
        summary: {
          added: 1,
          changed: 2,
          deleted: 3
        }
      },
      {
        kind: 'watch',
        status: 'succeeded',
        jobId: 'test-source:watch:1',
        summary: {
          action: 'change',
          appliedDeltas: 1,
          failedDeltas: 0
        }
      },
      {
        kind: 'scan',
        status: 'succeeded',
        jobId: 'test-source:scan:1',
        summary: {
          batches: 1,
          records: 1
        }
      }
    ])
  })

  it('keeps bounded recent runtime task history per source', async () => {
    runtime.registerSource(buildSource())

    for (let index = 0; index < 10; index += 1) {
      await runtime.scanSource('test-source', IndexedSourceScanReasons.Scheduled)
    }

    const diagnostics = await runtime.getDiagnostics()
    expect(diagnostics.sources[0].recentTasks).toHaveLength(8)
    expect(diagnostics.sources[0].recentTasks?.[0]).toMatchObject({
      kind: 'scan',
      jobId: 'test-source:scan:10'
    })
    expect(diagnostics.sources[0].recentTasks?.[7]).toMatchObject({
      kind: 'scan',
      jobId: 'test-source:scan:3'
    })
  })

  it('records reconcile request reason and root count in diagnostics', async () => {
    const reconcile = vi.fn(async () => ({
      sourceId: 'test-source',
      added: 1,
      changed: 0,
      deleted: 0,
      skipped: 0,
      errors: 0,
      startedAt: 1700000000000,
      completedAt: 1700000000100,
      reason: IndexedSourceReconcileReasons.WatchRootRecovered
    }))
    runtime.registerSource(buildSource({ reconcile }))

    await runtime.reconcileSource('test-source', {
      reason: IndexedSourceReconcileReasons.WatchRootRecovered,
      roots: [
        {
          sourceId: 'test-source',
          path: '/tmp/tuff-source',
          permissionState: 'granted',
          reason: IndexedSourceReconcileReasons.WatchRootRecovered
        }
      ]
    })

    expect(reconcile).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: IndexedSourceReconcileReasons.WatchRootRecovered,
        roots: [
          expect.objectContaining({
            path: '/tmp/tuff-source',
            reason: IndexedSourceReconcileReasons.WatchRootRecovered
          })
        ]
      })
    )

    const diagnostics = await runtime.getDiagnostics()
    expect(diagnostics.sources[0].lastReconcile).toMatchObject({
      added: 1,
      reason: IndexedSourceReconcileReasons.WatchRootRecovered,
      rootCount: 1,
      jobId: 'test-source:reconcile:1',
      queuedAt: expect.any(Number)
    })
  })

  it('guards concurrent reconcile tasks for the same source', async () => {
    let releaseReconcile!: () => void
    const blocked = new Promise<void>((resolve) => {
      releaseReconcile = resolve
    })
    const reconcile = vi.fn(async () => {
      await blocked
      return {
        sourceId: 'test-source',
        added: 0,
        changed: 1,
        deleted: 0,
        skipped: 0,
        errors: 0,
        startedAt: 1700000000000,
        completedAt: 1700000000100
      }
    })
    runtime.registerSource(buildSource({ reconcile }))

    const first = runtime.reconcileSource('test-source', {
      reason: IndexedSourceReconcileReasons.Scheduled
    })
    await expect(
      runtime.reconcileSource('test-source', {
        reason: IndexedSourceReconcileReasons.ManualRepair
      })
    ).rejects.toThrow("Indexed source 'test-source' reconcile is already running")

    releaseReconcile()
    await expect(first).resolves.toMatchObject({ changed: 1 })
    expect(reconcile).toHaveBeenCalledTimes(1)
  })

  it('exposes failed batch scan and reconcile state in diagnostics', async () => {
    runtime.registerSource(
      buildSource({
        descriptor: { ...descriptor, id: 'broken' },
        async *scan() {
          throw new Error('scan failed')
        },
        reconcile: vi.fn(async () => {
          throw new Error('reconcile failed')
        })
      })
    )

    await runtime.scanSourcesWithResult(IndexedSourceScanReasons.Scheduled)
    await runtime.reconcileSourcesWithResult()

    const diagnostics = await runtime.getDiagnostics()
    expect(diagnostics.sources[0]).toMatchObject({
      lastScan: {
        jobId: 'broken:scan:1',
        queuedAt: expect.any(Number),
        batches: 0,
        records: 0,
        error: 'scan failed'
      },
      lastReconcile: {
        added: 0,
        changed: 0,
        deleted: 0,
        skipped: 0,
        errors: 1,
        error: 'reconcile failed'
      }
    })
  })

  it('returns unsupported reconcile results for sources without reconcile support', async () => {
    runtime.registerSource(buildSource())

    const result = await runtime.reconcileSource('test-source')

    expect(result).toMatchObject({
      sourceId: 'test-source',
      reason: 'reconcile-not-supported',
      added: 0,
      changed: 0,
      deleted: 0
    })
  })
})
