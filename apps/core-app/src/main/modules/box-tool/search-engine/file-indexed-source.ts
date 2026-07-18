import {
  IndexedSourceScanReasons,
  IndexedSourceResetReasons,
  type IndexedSource,
  type IndexedSourceDescriptor,
  type IndexedSourceHealth,
  type IndexedSourcePermissionState,
  type IndexedSourceProgress,
  type IndexedSourceProgressStatus,
  type IndexedSourceReconcileRequest,
  type IndexedSourceReconcileResult,
  type IndexedSourceRecordBatch,
  type IndexedSourceResetRequest,
  type IndexedSourceResetResult,
  type IndexedSourceRoot,
  type IndexedSourceScanRequest
} from '@talex-touch/utils/search'
import { fileProvider } from '../addon/files/file-provider'
import { openIndexedSourcePath } from './indexed-source-open'

export const FILE_INDEXED_SOURCE_ID = 'file-provider'

export function buildFileIndexedSourceDescriptor(): IndexedSourceDescriptor {
  return {
    id: FILE_INDEXED_SOURCE_ID,
    kind: 'file',
    displayName: 'File Index',
    platforms: ['darwin', 'win32', 'linux'],
    priority: 'deferred',
    storage: 'sqlite-index',
    privacy: 'medium',
    capabilities: {
      scan: true,
      watch: true,
      reconcile: true,
      reset: true,
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
}

function buildRoots(sourceId: string, paths: string[]): IndexedSourceRoot[] {
  const pendingPermissionPaths = new Set(fileProvider.getPendingWatchPermissionPaths())
  return paths.map((path) => ({
    sourceId,
    path,
    permissionState: resolveRootPermissionState(path, pendingPermissionPaths),
    reason: pendingPermissionPaths.has(path)
      ? 'file-index-watch-root-pending-permission'
      : undefined
  }))
}

function resolveRootPermissionState(
  path: string,
  pendingPermissionPaths: Set<string>
): IndexedSourcePermissionState {
  return pendingPermissionPaths.has(path) ? 'promptable' : 'granted'
}

async function getFileIndexedSourceHealth(): Promise<IndexedSourceHealth> {
  const [status, stats] = await Promise.all([
    Promise.resolve(fileProvider.getIndexingStatus()),
    fileProvider.getIndexStats()
  ])
  const isWarming = status.isInitializing || status.startupPending || !status.startupReady
  const lastError = status.error || status.startupError || null
  const hasPendingPermissionRoots = fileProvider.getPendingWatchPermissionPaths().length > 0

  return {
    status: hasPendingPermissionRoots
      ? 'permission-required'
      : status.initializationFailed
        ? 'error'
        : isWarming
          ? 'warming'
          : lastError
            ? 'degraded'
            : 'ready',
    permissionState: hasPendingPermissionRoots ? 'promptable' : 'granted',
    itemCount: stats.totalFiles,
    watchState: hasPendingPermissionRoots
      ? 'pending-permission'
      : status.startupReady
        ? 'active'
        : 'unavailable',
    reconcileState: status.progress.stage === 'reconciliation' ? 'running' : 'idle',
    reason: hasPendingPermissionRoots
      ? 'file-index-watch-root-pending-permission'
      : (lastError ?? undefined),
    lastScanStartedAt: status.startTime ?? undefined,
    lastError: lastError ?? undefined
  }
}

function resolveFileSourceProgressStatus(
  status: ReturnType<typeof fileProvider.getIndexingStatus>
): IndexedSourceProgressStatus {
  if (status.initializationFailed) return 'failed'
  if (status.progress.stage === 'completed') return 'complete'
  if (status.progress.stage === 'idle') return 'idle'
  if (status.isInitializing) {
    if (status.estimateStatus === 'estimated') return 'estimated'
    if (status.estimateStatus === 'stabilizing') return 'stabilizing'
    if (status.estimateStatus === 'stalled') return 'stalled'
    return 'running'
  }
  return 'idle'
}

async function getFileIndexedSourceProgress(): Promise<IndexedSourceProgress> {
  const status = fileProvider.getIndexingStatus()
  const total = Math.max(0, status.progress.total ?? 0)
  const current = Math.max(0, status.progress.current ?? 0)

  return {
    sourceId: FILE_INDEXED_SOURCE_ID,
    stage: status.progress.stage ?? 'idle',
    status: resolveFileSourceProgressStatus(status),
    current,
    total,
    progress: total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0,
    startedAt: status.startTime,
    updatedAt: Date.now(),
    estimatedRemainingMs: status.estimatedRemainingMs,
    estimatedCompletionAt: status.estimatedCompletion,
    averageItemsPerSecond: status.averageItemsPerSecond,
    speedSampleCount: status.speedSampleCount,
    estimateBasis: status.estimateBasis,
    reason: status.error ?? status.startupError ?? undefined
  }
}

export function buildFileIndexedSource(): IndexedSource {
  const descriptor = buildFileIndexedSourceDescriptor()

  return {
    descriptor,
    getHealth: getFileIndexedSourceHealth,
    getRoots: async () => buildRoots(descriptor.id, fileProvider.getWatchedPaths()),
    getEvidence: async () => await fileProvider.getIndexedSourceEvidence(),
    getProgress: getFileIndexedSourceProgress,
    shouldHandleWatchEvent: (event) => fileProvider.ownsWatchPath(event.path),
    async *scan(request: IndexedSourceScanRequest): AsyncIterable<IndexedSourceRecordBatch> {
      if (request.signal?.aborted) {
        throw request.signal.reason ?? new Error('file-indexed-source-scan-aborted')
      }
      if (request.reason === IndexedSourceScanReasons.SchemaMigration) {
        yield* fileProvider.streamIndexedSourceSnapshot(request)
        return
      }

      const controller = new AbortController()
      const queued: IndexedSourceRecordBatch[] = []
      const producerWaiters = new Set<() => void>()
      let consumerWake: (() => void) | null = null
      let producerDone = false
      let producerError: unknown = null
      let terminalBatchSeen = false
      const abort = () => {
        controller.abort(request.signal?.reason)
        for (const wake of producerWaiters) wake()
        producerWaiters.clear()
        consumerWake?.()
      }
      request.signal?.addEventListener('abort', abort, { once: true })

      const enqueue = async (batch: IndexedSourceRecordBatch): Promise<void> => {
        while (queued.length >= 2) {
          if (controller.signal.aborted) throw new Error('file-indexed-source-scan-aborted')
          await new Promise<void>((resolve) => producerWaiters.add(resolve))
        }
        if (controller.signal.aborted) throw new Error('file-indexed-source-scan-aborted')
        queued.push(batch)
        if (batch.done === true) terminalBatchSeen = true
        consumerWake?.()
      }

      const producer = fileProvider
        .scanIndexedSource(
          { ...request, signal: controller.signal },
          {
            onRecordBatch: enqueue,
            onDelta: request.onDelta,
            throwOnFailure: true,
            signal: controller.signal,
            mutationLeaseId: request.mutationLeaseId
          }
        )
        .then(async () => {
          if (!terminalBatchSeen) {
            await enqueue({ sourceId: descriptor.id, records: [], done: true })
          }
          producerDone = true
          consumerWake?.()
        })
        .catch((error) => {
          producerError = error
          producerDone = true
          consumerWake?.()
        })

      try {
        while (true) {
          const batch = queued.shift()
          if (batch) {
            for (const wake of producerWaiters) wake()
            producerWaiters.clear()
            yield batch
            continue
          }
          if (producerError) throw producerError
          if (producerDone) return
          await new Promise<void>((resolve) => {
            consumerWake = resolve
          })
          consumerWake = null
        }
      } finally {
        abort()
        request.signal?.removeEventListener('abort', abort)
        await producer
      }
    },
    reconcile: async (
      request: IndexedSourceReconcileRequest
    ): Promise<IndexedSourceReconcileResult> => {
      return await fileProvider.reconcileIndexedSource(request)
    },
    drainMutations: async (request) =>
      await fileProvider.drainIndexedSourceMutations(
        `indexed-source.${request.reason}`,
        request.leaseId
      ),
    handleWatchEvent: async (event) => await fileProvider.handleIndexedSourceWatchEvent(event),
    open: async (record) => await openIndexedSourcePath(record.path),
    resetIndex: async (request: IndexedSourceResetRequest): Promise<IndexedSourceResetResult> => {
      return await fileProvider.resetIndexedSourceRuntimeState(request)
    },
    clearIndex: async (): Promise<IndexedSourceResetResult> => {
      return await fileProvider.resetIndexedSourceRuntimeState({
        sourceId: FILE_INDEXED_SOURCE_ID,
        reason: IndexedSourceResetReasons.UserClear,
        clearSearchIndex: true,
        clearScanProgress: true
      })
    }
  }
}
