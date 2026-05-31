import type {
  IndexedSource,
  IndexedSourceDelta,
  IndexedSourceDescriptor,
  IndexedSourceEvidence,
  IndexedSourceHealth,
  IndexedSourceOpenAction,
  IndexedSourceOpenResult,
  IndexedSourceReconcileRequest,
  IndexedSourceReconcileResult,
  IndexedSourceRecord,
  IndexedSourceRecordBatch,
  IndexedSourceResetRequest,
  IndexedSourceResetResult,
  IndexedSourceRoot,
  IndexedSourceScanRequest,
  IndexedSourceWatchEvent
} from '@talex-touch/utils/search'
import {
  createQuicklinksIndexedSourceDescriptor,
  IndexedSourceReconcileReasons,
  IndexedWriteRuntimeEmitterService
} from '@talex-touch/utils/search'

export const QUICKLINKS_INDEXED_SOURCE_ID = 'quicklinks'

export interface QuicklinkIndexedSourceItem {
  id: string
  title: string
  url: string
  subtitle?: string
  icon?: string
  keywords?: string[]
  tags?: string[]
  updatedAt?: number
  metadata?: Record<string, unknown>
}

export interface QuicklinksIndexedSourceSnapshot {
  items: QuicklinkIndexedSourceItem[]
  roots?: IndexedSourceRoot[]
  evidence?: IndexedSourceEvidence[]
  lastLoadedAt?: number
}

export interface QuicklinksIndexedSourceOptions {
  items?: QuicklinkIndexedSourceItem[]
  loadSnapshot?: () => QuicklinksIndexedSourceSnapshot | Promise<QuicklinksIndexedSourceSnapshot>
  openUrl?: (
    url: string,
    record: IndexedSourceRecord,
    action: IndexedSourceOpenAction
  ) => Promise<IndexedSourceOpenResult> | IndexedSourceOpenResult
  clear?: () => Promise<void> | void
}

export function buildQuicklinksIndexedSourceDescriptor(): IndexedSourceDescriptor {
  return createQuicklinksIndexedSourceDescriptor({
    id: QUICKLINKS_INDEXED_SOURCE_ID,
    capabilities: {
      reset: true
    },
    admission: {
      notes:
        'Low-privacy quicklink runtime source; official plugins can feed records through the runtime boundary instead of pushing directly to root results.'
    }
  })
}

function createQuicklinksRuntimeEmitter(sourceId: string) {
  return new IndexedWriteRuntimeEmitterService<QuicklinkIndexedSourceItem>({
    sourceId,
    mapRecord: (item) => mapQuicklinkToIndexedSourceRecord(sourceId, item),
    getPath: (item) => item.url
  })
}

export function mapQuicklinkToIndexedSourceRecord(
  sourceId: string,
  item: QuicklinkIndexedSourceItem
): IndexedSourceRecord {
  return {
    sourceId,
    recordId: item.id,
    stableKey: item.id,
    kind: 'quicklink',
    title: item.title,
    subtitle: item.subtitle ?? item.url,
    uri: item.url,
    icon: item.icon,
    mtime: item.updatedAt,
    keywords: item.keywords,
    tags: item.tags,
    metadata: {
      ...item.metadata,
      url: item.url
    }
  }
}

function buildDefaultSnapshot(
  items: QuicklinkIndexedSourceItem[] = []
): QuicklinksIndexedSourceSnapshot {
  return {
    items,
    lastLoadedAt: Date.now()
  }
}

function buildQuicklinksHealth(snapshot: QuicklinksIndexedSourceSnapshot): IndexedSourceHealth {
  return {
    status: snapshot.items.length > 0 ? 'ready' : 'degraded',
    permissionState: 'not-required',
    itemCount: snapshot.items.length,
    watchState: 'active',
    reconcileState: 'idle',
    reason: snapshot.items.length > 0 ? undefined : 'quicklinks-empty',
    lastIndexedAt: snapshot.lastLoadedAt,
    lastScanCompletedAt: snapshot.lastLoadedAt
  }
}

function buildQuicklinksEvidence(
  sourceId: string,
  snapshot: QuicklinksIndexedSourceSnapshot
): IndexedSourceEvidence[] {
  if (snapshot.evidence) {
    return snapshot.evidence
  }

  return [
    {
      id: `${sourceId}:official-plugin-feed`,
      label: 'Official plugin quicklinks',
      status: snapshot.items.length > 0 ? 'ready' : 'degraded',
      itemCount: snapshot.items.length,
      rootCount: snapshot.roots?.length ?? 0,
      lastCheckedAt: snapshot.lastLoadedAt,
      reason: snapshot.items.length > 0 ? undefined : 'quicklinks-empty',
      metadata: {
        storage: 'runtime-feed'
      }
    }
  ]
}

async function buildSnapshot(
  options: QuicklinksIndexedSourceOptions
): Promise<QuicklinksIndexedSourceSnapshot> {
  if (options.loadSnapshot) {
    const snapshot = await options.loadSnapshot()
    return {
      ...snapshot,
      items: snapshot.items ?? [],
      lastLoadedAt: snapshot.lastLoadedAt ?? Date.now()
    }
  }

  return buildDefaultSnapshot(options.items)
}

function buildQuicklinksReconcileResult(
  sourceId: string,
  snapshot: QuicklinksIndexedSourceSnapshot,
  request: IndexedSourceReconcileRequest
): IndexedSourceReconcileResult {
  const startedAt = Date.now()
  const reason = request.reason ?? IndexedSourceReconcileReasons.ExternalRefresh
  const runtimeEmitter = createQuicklinksRuntimeEmitter(sourceId)
  const deltas = snapshot.items.map((item) =>
    runtimeEmitter.buildDelta(item, {
      action: 'change',
      reason
    })
  )

  return {
    sourceId,
    added: 0,
    changed: deltas.length,
    deleted: 0,
    skipped: deltas.length > 0 ? 0 : 1,
    errors: 0,
    deltas,
    startedAt,
    completedAt: Date.now(),
    reason
  }
}

function buildQuicklinksResetResult(request: IndexedSourceResetRequest): IndexedSourceResetResult {
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

export function buildQuicklinksIndexedSource(
  options: QuicklinksIndexedSourceOptions = {}
): IndexedSource {
  const descriptor = buildQuicklinksIndexedSourceDescriptor()

  return {
    descriptor,
    getHealth: async () => buildQuicklinksHealth(await buildSnapshot(options)),
    getRoots: async (): Promise<IndexedSourceRoot[]> => {
      const snapshot = await buildSnapshot(options)
      return snapshot.roots ?? []
    },
    getEvidence: async () => buildQuicklinksEvidence(descriptor.id, await buildSnapshot(options)),
    scan: async function* quicklinksScan(
      _request: IndexedSourceScanRequest
    ): AsyncIterable<IndexedSourceRecordBatch> {
      const snapshot = await buildSnapshot(options)
      const batch = createQuicklinksRuntimeEmitter(descriptor.id).buildBatch(snapshot.items, {
        done: true
      })

      if (batch.records.length > 0) {
        yield batch
      }
    },
    reconcile: async (
      request: IndexedSourceReconcileRequest
    ): Promise<IndexedSourceReconcileResult> => {
      return buildQuicklinksReconcileResult(descriptor.id, await buildSnapshot(options), request)
    },
    handleWatchEvent: async (_event: IndexedSourceWatchEvent): Promise<IndexedSourceDelta[]> => {
      const snapshot = await buildSnapshot(options)
      const runtimeEmitter = createQuicklinksRuntimeEmitter(descriptor.id)
      return snapshot.items.map((item) =>
        runtimeEmitter.buildDelta(item, {
          action: 'change',
          reason: 'quicklinks-watch-refresh'
        })
      )
    },
    resetIndex: async (request: IndexedSourceResetRequest): Promise<IndexedSourceResetResult> => {
      return buildQuicklinksResetResult(request)
    },
    clearIndex: async () => {
      await options.clear?.()
    },
    open: async (
      record: IndexedSourceRecord,
      action: IndexedSourceOpenAction
    ): Promise<IndexedSourceOpenResult> => {
      if (!record.uri) {
        return {
          status: 'blocked',
          reason: 'quicklink-uri-missing'
        }
      }

      if (!options.openUrl) {
        return {
          status: 'unsupported',
          reason: 'quicklink-open-handler-not-configured'
        }
      }

      return await options.openUrl(record.uri, record, action)
    }
  }
}
