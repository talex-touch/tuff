import type {
  IndexedSource,
  IndexedSourceDescriptor,
  IndexedSourceEvidence,
  IndexedSourceHealth,
  IndexedSourceReconcileRequest,
  IndexedSourceReconcileResult,
  IndexedSourceRecordBatch,
  IndexedSourceRoot,
  IndexedSourceScanRequest
} from '@talex-touch/utils/search'
import type { BrowserBookmarkScanOptions } from './browser-bookmarks-scanner'
import {
  mapBrowserBookmarkToIndexedSourceRecord,
  scanBrowserBookmarks
} from './browser-bookmarks-scanner'

export const BROWSER_BOOKMARKS_INDEXED_SOURCE_ID = 'browser-bookmarks'

export interface BrowserBookmarksIndexedSourceOptions {
  enabled?: boolean
  scannerOptions?: BrowserBookmarkScanOptions
}

export function buildBrowserBookmarksIndexedSourceDescriptor(): IndexedSourceDescriptor {
  return {
    id: BROWSER_BOOKMARKS_INDEXED_SOURCE_ID,
    kind: 'browser-bookmark',
    displayName: 'Browser Bookmarks',
    platforms: ['darwin', 'win32', 'linux'],
    priority: 'deferred',
    storage: 'sqlite-index',
    privacy: 'high',
    capabilities: {
      scan: true,
      watch: true,
      reconcile: true,
      clear: true,
      open: true
    },
    admission: {
      owner: 'official-plugin',
      permissionScopes: ['browser-data', 'file-system'],
      defaultState: 'disabled',
      requiresUserConsent: true,
      clearable: true,
      rebuildable: true,
      notes:
        'Chromium Bookmarks JSON currently lives in touch-browser-data and must migrate into runtime-backed scan/watch/reconcile before default enablement.'
    }
  }
}

function buildBrowserBookmarksHealth(enabled: boolean, itemCount = 0): IndexedSourceHealth {
  if (enabled) {
    return {
      status: 'warming',
      permissionState: 'granted',
      itemCount,
      watchState: 'unavailable',
      reconcileState: 'idle',
      reason: 'browser-bookmarks-runtime-scanner-ready-awaiting-settings'
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
  scannerOptions?: BrowserBookmarkScanOptions
): IndexedSourceEvidence[] {
  if (!enabled) {
    return [buildPendingMigrationEvidence()]
  }

  const result = scanBrowserBookmarks(scannerOptions)
  const evidence = result.diagnostics.map(
    (diagnostic): IndexedSourceEvidence => ({
      id: `${BROWSER_BOOKMARKS_INDEXED_SOURCE_ID}:${diagnostic.browserId}`,
      label: `${diagnostic.browserName} Bookmarks`,
      status:
        diagnostic.status === 'available'
          ? 'ready'
          : diagnostic.status === 'read-failed'
            ? 'error'
            : diagnostic.status === 'unsupported'
              ? 'unsupported'
              : 'degraded',
      itemCount: result.items.filter((item) => item.browserId === diagnostic.browserId).length,
      rootCount: diagnostic.root ? 1 : 0,
      roots: diagnostic.root ? [diagnostic.root] : [],
      reason: diagnostic.reason || undefined,
      metadata: {
        profileCount: diagnostic.profileCount,
        failedProfile: diagnostic.failedProfile,
        lastError: diagnostic.lastError,
        scannerOwner: 'core-runtime'
      }
    })
  )

  return [...evidence, buildPendingMigrationEvidence()]
}

function buildBrowserBookmarksRoots(
  enabled: boolean,
  scannerOptions?: BrowserBookmarkScanOptions
): IndexedSourceRoot[] {
  if (!enabled) {
    return []
  }

  const result = scanBrowserBookmarks(scannerOptions)
  return result.diagnostics
    .filter((diagnostic) => Boolean(diagnostic.root) && diagnostic.status !== 'unsupported')
    .map((diagnostic) => ({
      sourceId: BROWSER_BOOKMARKS_INDEXED_SOURCE_ID,
      path: diagnostic.root,
      permissionState: 'granted',
      watchDepth: 2,
      reason: diagnostic.reason || undefined
    }))
}

async function* emptyScan(
  _request: IndexedSourceScanRequest
): AsyncIterable<IndexedSourceRecordBatch> {}

async function* scanBrowserBookmarksSource(
  request: IndexedSourceScanRequest,
  scannerOptions?: BrowserBookmarkScanOptions
): AsyncIterable<IndexedSourceRecordBatch> {
  const result = scanBrowserBookmarks(scannerOptions)
  const records = result.items.map((item) =>
    mapBrowserBookmarkToIndexedSourceRecord(request.sourceId, item)
  )

  if (records.length > 0) {
    yield {
      sourceId: request.sourceId,
      records,
      done: true
    }
  }
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

export function buildBrowserBookmarksIndexedSource(
  options: BrowserBookmarksIndexedSourceOptions = {}
): IndexedSource {
  const descriptor = buildBrowserBookmarksIndexedSourceDescriptor()
  const enabled = options.enabled === true

  return {
    descriptor,
    getHealth: async () => buildBrowserBookmarksHealth(enabled),
    getRoots: async (): Promise<IndexedSourceRoot[]> =>
      buildBrowserBookmarksRoots(enabled, options.scannerOptions),
    getEvidence: async () => buildBrowserBookmarksEvidence(enabled, options.scannerOptions),
    scan: enabled
      ? async function* browserBookmarksScan(request: IndexedSourceScanRequest) {
          yield* scanBrowserBookmarksSource(request, options.scannerOptions)
        }
      : emptyScan,
    reconcile: async (
      _request: IndexedSourceReconcileRequest
    ): Promise<IndexedSourceReconcileResult> => buildUnsupportedReconcileResult(descriptor.id),
    handleWatchEvent: async () => [],
    clearIndex: async () => {}
  }
}
