import type {
  IndexedSource,
  IndexedSourceDelta,
  IndexedSourceDescriptor,
  IndexedSourceEvidence,
  IndexedSourceHealth,
  IndexedSourceOpenResult,
  IndexedSourceProfileDiagnostic,
  IndexedSourceReconcileRequest,
  IndexedSourceReconcileResult,
  IndexedSourceRecordBatch,
  IndexedSourceResetRequest,
  IndexedSourceResetResult,
  IndexedSourceRoot,
  IndexedSourceScanRequest,
  IndexedSourceWatchEvent,
  IndexedSourceProviderConfigEnablement,
  SearchProviderDescriptor
} from '@talex-touch/utils/search'
import { shell } from 'electron'
import { openValidatedExternalUrl } from '../../../utils/external-url-policy'
import type { BrowserBookmarkItem, BrowserBookmarkScanOptions } from './browser-bookmarks-scanner'
import {
  createBrowserBookmarksIndexedSourceDescriptor,
  IndexedWriteRuntimeEmitterService,
  IndexedSourceProfileDiagnosticsService,
  IndexedSourceReconcileReasons,
  IndexedSourceSnapshotCacheService,
  isIndexedWatchPathBasename
} from '@talex-touch/utils/search'
import {
  mapBrowserBookmarkToIndexedSourceRecord,
  scanBrowserBookmarks
} from './browser-bookmarks-scanner'

export const BROWSER_BOOKMARKS_INDEXED_SOURCE_ID = 'browser-bookmarks'
export const BROWSER_BOOKMARKS_OFFICIAL_PROVIDER_ID = 'touch-browser-data.browser-bookmarks'
export const BROWSER_BOOKMARKS_DISABLED_REASON =
  'browser-bookmarks-official-provider-consent-required'
export const BROWSER_BOOKMARKS_RUNTIME_BRIDGE_REASON =
  'browser-bookmarks-official-plugin-owned-runtime'

const browserProfileDiagnosticsService = new IndexedSourceProfileDiagnosticsService()

function createBrowserBookmarksRuntimeEmitter(sourceId: string) {
  return new IndexedWriteRuntimeEmitterService<BrowserBookmarkItem>({
    sourceId,
    mapRecord: (bookmark) => mapBrowserBookmarkToIndexedSourceRecord(sourceId, bookmark),
    getPath: (bookmark) => bookmark.url
  })
}

export interface BrowserBookmarksIndexedSourceOptions {
  enabled?: boolean
  isEnabled?: () => boolean | Promise<boolean>
  getEnablement?: () =>
    | IndexedSourceProviderConfigEnablement
    | Promise<IndexedSourceProviderConfigEnablement>
  scannerOptions?: BrowserBookmarkScanOptions
}

export function buildBrowserBookmarksIndexedSourceDescriptor(): IndexedSourceDescriptor {
  return createBrowserBookmarksIndexedSourceDescriptor({
    id: BROWSER_BOOKMARKS_INDEXED_SOURCE_ID,
    capabilities: {
      reset: true
    },
    admission: {
      notes:
        'Chromium Bookmarks JSON is gated by the official touch-browser-data provider and indexed through the plugin-owned runtime lifecycle.'
    }
  })
}

export function buildBrowserBookmarksOfficialProviderDescriptor(): SearchProviderDescriptor {
  return {
    id: BROWSER_BOOKMARKS_OFFICIAL_PROVIDER_ID,
    displayName: 'Browser Bookmarks',
    kind: 'browser-bookmark',
    owner: 'official-plugin',
    mode: 'push',
    priority: 'fast',
    defaultOrder: 60,
    policy: {
      owner: 'official-plugin',
      mode: 'push',
      permissionScopes: ['root-results', 'browser-data'],
      defaultState: 'ask',
      requiresUserConsent: true,
      pushesToRootResults: true,
      indexedSourceId: BROWSER_BOOKMARKS_INDEXED_SOURCE_ID
    }
  }
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
  const runtimeEmitter = createBrowserBookmarksRuntimeEmitter(sourceId)
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
      scannerOwner: 'touch-browser-data',
      providerId: BROWSER_BOOKMARKS_OFFICIAL_PROVIDER_ID,
      runtimeOwner: 'official-plugin'
    }
  })

  return {
    result,
    batch: runtimeEmitter.buildBatch(result.items, { done: true }),
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
    reason: BROWSER_BOOKMARKS_DISABLED_REASON
  }
}

function buildProviderLifecycleEvidence(
  enablement: IndexedSourceProviderConfigEnablement
): IndexedSourceEvidence {
  const enabled = enablement.enabled
  return {
    id: `${BROWSER_BOOKMARKS_INDEXED_SOURCE_ID}:touch-browser-data`,
    label: 'touch-browser-data provider lifecycle',
    status: enabled ? 'warming' : 'disabled',
    itemCount: 0,
    rootCount: 0,
    reason: enabled ? BROWSER_BOOKMARKS_RUNTIME_BRIDGE_REASON : BROWSER_BOOKMARKS_DISABLED_REASON,
    metadata: {
      providerId: BROWSER_BOOKMARKS_OFFICIAL_PROVIDER_ID,
      currentOwner: 'touch-browser-data',
      runtimeOwner: 'official-plugin',
      storage: 'sqlite-index',
      privacy: 'high',
      persistentPluginIndexing: enabled,
      enablementReason: enablement.reason,
      linkedProviderIds: enablement.providerIds,
      configuredProviderIds: enablement.configuredProviderIds,
      enabledProviderIds: enablement.enabledProviderIds,
      disabledProviderIds: enablement.disabledProviderIds
    }
  }
}

function buildBrowserBookmarksEvidence(
  enablement: IndexedSourceProviderConfigEnablement,
  snapshot?: ReturnType<typeof readBrowserBookmarksSnapshot>
): IndexedSourceEvidence[] {
  const enabled = enablement.enabled
  if (!enabled) {
    return [buildProviderLifecycleEvidence(enablement)]
  }

  return [...(snapshot?.evidence ?? []), buildProviderLifecycleEvidence(enablement)]
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

function isBrowserBookmarksWatchEvent(event: IndexedSourceWatchEvent): boolean {
  return isIndexedWatchPathBasename({
    rawPath: event.path,
    basename: 'Bookmarks'
  })
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
  const snapshot = readBrowserBookmarksSnapshot(sourceId, scannerOptions)
  const runtimeEmitter = createBrowserBookmarksRuntimeEmitter(sourceId)
  return snapshot.result.items.map((item) =>
    runtimeEmitter.buildDelta(item, {
      action: 'change',
      reason
    })
  )
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
    reason: BROWSER_BOOKMARKS_DISABLED_REASON
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
  const reason = request.reason ?? IndexedSourceReconcileReasons.ExternalRefresh
  const runtimeEmitter = createBrowserBookmarksRuntimeEmitter(sourceId)
  const deltas = snapshot.result.items.map((item) =>
    runtimeEmitter.buildDelta(item, {
      action: 'change',
      reason
    })
  )

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
    reason
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

function buildStaticEnablement(enabled: boolean): IndexedSourceProviderConfigEnablement {
  return {
    sourceId: BROWSER_BOOKMARKS_INDEXED_SOURCE_ID,
    providerIds: [BROWSER_BOOKMARKS_INDEXED_SOURCE_ID, BROWSER_BOOKMARKS_OFFICIAL_PROVIDER_ID],
    configuredProviderIds: [],
    enabledProviderIds: enabled ? [BROWSER_BOOKMARKS_OFFICIAL_PROVIDER_ID] : [],
    disabledProviderIds: [],
    enabled,
    reason: enabled ? 'explicitly-enabled' : 'not-configured'
  }
}

export function buildBrowserBookmarksIndexedSource(
  options: BrowserBookmarksIndexedSourceOptions = {}
): IndexedSource {
  const descriptor = buildBrowserBookmarksIndexedSourceDescriptor()
  const snapshotCache = new IndexedSourceSnapshotCacheService<
    ReturnType<typeof readBrowserBookmarksSnapshot>
  >()
  const resolveEnablement = async (): Promise<IndexedSourceProviderConfigEnablement> => {
    if (options.getEnablement) {
      return await options.getEnablement()
    }

    return buildStaticEnablement(
      options.isEnabled ? Boolean(await options.isEnabled()) : options.enabled === true
    )
  }
  const getCachedSnapshot = async () =>
    await snapshotCache.getSnapshot(() =>
      readBrowserBookmarksSnapshot(descriptor.id, options.scannerOptions)
    )

  return {
    descriptor,
    getHealth: async () => {
      const enablement = await resolveEnablement()
      return buildBrowserBookmarksHealth(
        enablement.enabled,
        enablement.enabled ? await getCachedSnapshot() : undefined
      )
    },
    getRoots: async (): Promise<IndexedSourceRoot[]> => {
      const enablement = await resolveEnablement()
      return buildBrowserBookmarksRoots(
        enablement.enabled,
        enablement.enabled ? await getCachedSnapshot() : undefined
      )
    },
    getEvidence: async () => {
      const enablement = await resolveEnablement()
      return buildBrowserBookmarksEvidence(
        enablement,
        enablement.enabled ? await getCachedSnapshot() : undefined
      )
    },
    scan: async function* browserBookmarksScan(request: IndexedSourceScanRequest) {
      if ((await resolveEnablement()).enabled) {
        snapshotCache.clear()
        yield* scanBrowserBookmarksSource(request, options.scannerOptions)
      } else {
        yield* emptyScan(request)
      }
    },
    reconcile: async (
      request: IndexedSourceReconcileRequest
    ): Promise<IndexedSourceReconcileResult> => {
      if (!(await resolveEnablement()).enabled) {
        return buildUnsupportedReconcileResult(descriptor.id)
      }

      snapshotCache.clear()
      return buildBrowserBookmarksReconcileResult(descriptor.id, options.scannerOptions, request)
    },
    handleWatchEvent: async (_event: IndexedSourceWatchEvent): Promise<IndexedSourceDelta[]> => {
      if (!(await resolveEnablement()).enabled) {
        return []
      }

      snapshotCache.clear()
      return buildBrowserBookmarksDeltas(
        descriptor.id,
        options.scannerOptions,
        'browser-bookmarks-watch-refresh'
      )
    },
    shouldHandleWatchEvent: isBrowserBookmarksWatchEvent,
    open: async (record): Promise<IndexedSourceOpenResult> => {
      if (!(await resolveEnablement()).enabled) {
        return {
          status: 'blocked',
          reason: BROWSER_BOOKMARKS_DISABLED_REASON
        }
      }
      if (!record.uri) {
        return {
          status: 'blocked',
          reason: 'browser-bookmark-uri-missing'
        }
      }

      try {
        const decision = await openValidatedExternalUrl(record.uri, { opener: shell.openExternal })
        return decision.allowed
          ? { status: 'started' }
          : { status: 'blocked', reason: decision.reason }
      } catch (error) {
        return {
          status: 'failed',
          reason: error instanceof Error ? error.message : String(error)
        }
      }
    },
    resetIndex: async (request: IndexedSourceResetRequest): Promise<IndexedSourceResetResult> => {
      snapshotCache.clear()
      return buildBrowserBookmarksResetResult(request)
    },
    clearIndex: async () => {
      snapshotCache.clear()
    }
  }
}
