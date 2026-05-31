import type {
  IndexedSource,
  IndexedSourceDelta,
  IndexedSourceDescriptor,
  IndexedSourceEvidence,
  IndexedSourceHealth,
  IndexedSourceProfileDiagnostic,
  IndexedSourceReconcileRequest,
  IndexedSourceReconcileResult,
  IndexedSourceRecordBatch,
  IndexedSourceResetRequest,
  IndexedSourceResetResult,
  IndexedSourceRoot,
  IndexedSourceScanRequest,
  IndexedSourceWatchEvent
} from '@talex-touch/utils/search'
import type { BrowserBookmarkScanOptions } from './browser-bookmarks-scanner'
import {
  createBrowserBookmarksIndexedSourceDescriptor,
  IndexedSourceProfileDiagnosticsService,
  IndexedSourceReconcileReasons,
  IndexedSourceSnapshotCacheService
} from '@talex-touch/utils/search'
import {
  mapBrowserBookmarkToIndexedSourceRecord,
  scanBrowserBookmarks
} from './browser-bookmarks-scanner'

export const BROWSER_BOOKMARKS_INDEXED_SOURCE_ID = 'browser-bookmarks'

const browserProfileDiagnosticsService = new IndexedSourceProfileDiagnosticsService()

export interface BrowserBookmarksIndexedSourceOptions {
  enabled?: boolean
  isEnabled?: () => boolean | Promise<boolean>
  scannerOptions?: BrowserBookmarkScanOptions
}

export function buildBrowserBookmarksIndexedSourceDescriptor(): IndexedSourceDescriptor {
  return createBrowserBookmarksIndexedSourceDescriptor({
    id: BROWSER_BOOKMARKS_INDEXED_SOURCE_ID,
    admission: {
      notes:
        'Chromium Bookmarks JSON currently lives in touch-browser-data and must migrate into runtime-backed scan/watch/reconcile before default enablement.'
    }
  })
}

function readBrowserBookmarksSnapshot(
  sourceId: string,
  scannerOptions?: BrowserBookmarkScanOptions
): {
  result: ReturnType<typeof scanBrowserBookmarks>
  batch: IndexedSourceRecordBatch
  roots: IndexedSourceRoot[]
  evidence: IndexedSourceEvidence[]
} {
  const result = scanBrowserBookmarks(scannerOptions)
  const records = result.items.map((item) =>
    mapBrowserBookmarkToIndexedSourceRecord(sourceId, item)
  )
  const itemCountsByBrowserId = new Map<string, number>()
  for (const item of result.items) {
    itemCountsByBrowserId.set(item.browserId, (itemCountsByBrowserId.get(item.browserId) ?? 0) + 1)
  }
  const profileDiagnostics: IndexedSourceProfileDiagnostic[] = result.diagnostics.map(
    (diagnostic) => ({
      key: diagnostic.browserId,
      label: `${diagnostic.browserName} Bookmarks`,
      status:
        diagnostic.status === 'available'
          ? 'ready'
          : diagnostic.status === 'read-failed'
            ? 'error'
            : diagnostic.status === 'unsupported'
              ? 'unsupported'
              : 'degraded',
      root: diagnostic.root || undefined,
      itemCount: itemCountsByBrowserId.get(diagnostic.browserId) ?? 0,
      reason: diagnostic.reason || undefined,
      metadata: {
        profileCount: diagnostic.profileCount,
        failedProfile: diagnostic.failedProfile,
        lastError: diagnostic.lastError
      }
    })
  )
  const roots = browserProfileDiagnosticsService.buildRoots({
    sourceId,
    diagnostics: profileDiagnostics,
    rootWatchDepth: 2
  })
  const evidence = browserProfileDiagnosticsService.buildEvidence({
    sourceId,
    diagnostics: profileDiagnostics,
    metadata: {
      scannerOwner: 'core-runtime'
    }
  })

  return {
    result,
    batch: {
      sourceId,
      records,
      done: true
    },
    roots,
    evidence
  }
}

function buildBrowserBookmarksHealth(
  enabled: boolean,
  snapshot?: ReturnType<typeof readBrowserBookmarksSnapshot>
): IndexedSourceHealth {
  if (enabled) {
    const hasErrors = snapshot?.result.diagnostics.some(
      (diagnostic) => diagnostic.status === 'read-failed'
    )
    const itemCount = snapshot?.result.items.length ?? 0

    return {
      status: hasErrors ? 'degraded' : itemCount > 0 ? 'ready' : 'degraded',
      permissionState: 'granted',
      itemCount,
      watchState: snapshot?.roots.length ? 'active' : 'unavailable',
      reconcileState: 'idle',
      reason:
        itemCount > 0
          ? undefined
          : hasErrors
            ? 'browser-bookmarks-read-failed'
            : 'browser-bookmarks-empty'
    }
  }

  return {
    status: 'disabled',
    permissionState: 'promptable',
    itemCount: 0,
    watchState: 'pending-permission',
    reconcileState: 'idle',
    reason: 'browser-bookmarks-runtime-source-pending-migration'
  }
}

function buildPendingMigrationEvidence(): IndexedSourceEvidence {
  return {
    id: `${BROWSER_BOOKMARKS_INDEXED_SOURCE_ID}:touch-browser-data`,
    label: 'touch-browser-data plugin scanner',
    status: 'disabled',
    itemCount: 0,
    rootCount: 0,
    reason: 'chromium-bookmarks-json-plugin-scanner-not-yet-runtime-indexed',
    metadata: {
      currentOwner: 'touch-browser-data',
      plannedStorage: 'sqlite-index',
      plannedPrivacy: 'high'
    }
  }
}

function buildBrowserBookmarksEvidence(
  enabled: boolean,
  snapshot?: ReturnType<typeof readBrowserBookmarksSnapshot>
): IndexedSourceEvidence[] {
  if (!enabled) {
    return [buildPendingMigrationEvidence()]
  }

  return [...(snapshot?.evidence ?? []), buildPendingMigrationEvidence()]
}

function buildBrowserBookmarksRoots(
  enabled: boolean,
  snapshot?: ReturnType<typeof readBrowserBookmarksSnapshot>
): IndexedSourceRoot[] {
  if (!enabled) {
    return []
  }

  return snapshot?.roots ?? []
}

async function* emptyScan(
  _request: IndexedSourceScanRequest
): AsyncIterable<IndexedSourceRecordBatch> {}

async function* scanBrowserBookmarksSource(
  request: IndexedSourceScanRequest,
  scannerOptions?: BrowserBookmarkScanOptions
): AsyncIterable<IndexedSourceRecordBatch> {
  const { batch } = readBrowserBookmarksSnapshot(request.sourceId, scannerOptions)

  if (batch.records.length > 0) {
    yield batch
  }
}

function buildBrowserBookmarksDeltas(
  sourceId: string,
  scannerOptions: BrowserBookmarkScanOptions | undefined,
  reason: string
): IndexedSourceDelta[] {
  return readBrowserBookmarksSnapshot(sourceId, scannerOptions).batch.records.map((record) => ({
    sourceId,
    action: 'change',
    record,
    path: record.path ?? record.uri,
    reason
  }))
}

function buildUnsupportedReconcileResult(sourceId: string): IndexedSourceReconcileResult {
  const now = Date.now()
  return {
    sourceId,
    added: 0,
    changed: 0,
    deleted: 0,
    skipped: 1,
    errors: 0,
    startedAt: now,
    completedAt: now,
    reason: 'browser-bookmarks-runtime-source-pending-migration'
  }
}

function buildBrowserBookmarksReconcileResult(
  sourceId: string,
  scannerOptions: BrowserBookmarkScanOptions | undefined,
  request: IndexedSourceReconcileRequest
): IndexedSourceReconcileResult {
  const startedAt = Date.now()
  const snapshot = readBrowserBookmarksSnapshot(sourceId, scannerOptions)
  const errors = snapshot.result.diagnostics.filter(
    (diagnostic) => diagnostic.status === 'read-failed'
  ).length
  const deltas = snapshot.batch.records.map((record) => ({
    sourceId,
    action: 'change' as const,
    record,
    path: record.path ?? record.uri,
    reason: request.reason ?? IndexedSourceReconcileReasons.ExternalRefresh
  }))

  return {
    sourceId,
    added: 0,
    changed: snapshot.batch.records.length,
    deleted: 0,
    skipped: snapshot.batch.records.length > 0 ? 0 : 1,
    errors,
    deltas,
    startedAt,
    completedAt: Date.now(),
    reason: request.reason ?? IndexedSourceReconcileReasons.ExternalRefresh
  }
}

function buildBrowserBookmarksResetResult(
  request: IndexedSourceResetRequest
): IndexedSourceResetResult {
  const startedAt = Date.now()
  return {
    sourceId: request.sourceId,
    reason: request.reason,
    clearedSearchIndex: false,
    clearedScanProgress: false,
    scanProgressRows: 0,
    startedAt,
    completedAt: Date.now()
  }
}

export function buildBrowserBookmarksIndexedSource(
  options: BrowserBookmarksIndexedSourceOptions = {}
): IndexedSource {
  const descriptor = buildBrowserBookmarksIndexedSourceDescriptor()
  const snapshotCache = new IndexedSourceSnapshotCacheService<
    ReturnType<typeof readBrowserBookmarksSnapshot>
  >()
  const resolveEnabled = async () =>
    options.isEnabled ? Boolean(await options.isEnabled()) : options.enabled === true
  const getCachedSnapshot = async () =>
    await snapshotCache.getSnapshot(() =>
      readBrowserBookmarksSnapshot(descriptor.id, options.scannerOptions)
    )

  return {
    descriptor,
    getHealth: async () => {
      const enabled = await resolveEnabled()
      return buildBrowserBookmarksHealth(enabled, enabled ? await getCachedSnapshot() : undefined)
    },
    getRoots: async (): Promise<IndexedSourceRoot[]> => {
      const enabled = await resolveEnabled()
      return buildBrowserBookmarksRoots(enabled, enabled ? await getCachedSnapshot() : undefined)
    },
    getEvidence: async () => {
      const enabled = await resolveEnabled()
      return buildBrowserBookmarksEvidence(enabled, enabled ? await getCachedSnapshot() : undefined)
    },
    scan: async function* browserBookmarksScan(request: IndexedSourceScanRequest) {
      if (await resolveEnabled()) {
        snapshotCache.clear()
        yield* scanBrowserBookmarksSource(request, options.scannerOptions)
      } else {
        yield* emptyScan(request)
      }
    },
    reconcile: async (
      request: IndexedSourceReconcileRequest
    ): Promise<IndexedSourceReconcileResult> => {
      if (!(await resolveEnabled())) {
        return buildUnsupportedReconcileResult(descriptor.id)
      }

      snapshotCache.clear()
      return buildBrowserBookmarksReconcileResult(descriptor.id, options.scannerOptions, request)
    },
    handleWatchEvent: async (_event: IndexedSourceWatchEvent): Promise<IndexedSourceDelta[]> => {
      if (!(await resolveEnabled())) {
        return []
      }

      snapshotCache.clear()
      return buildBrowserBookmarksDeltas(
        descriptor.id,
        options.scannerOptions,
        'browser-bookmarks-watch-refresh'
      )
    },
    resetIndex: async (request: IndexedSourceResetRequest): Promise<IndexedSourceResetResult> => {
      snapshotCache.clear()
      return buildBrowserBookmarksResetResult(request)
    },
    clearIndex: async () => {
      throw new Error('browser-bookmarks-clear-requires-runtime-reset')
    }
  }
}
