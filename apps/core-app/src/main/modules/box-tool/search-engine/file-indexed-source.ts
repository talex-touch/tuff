import type {
  IndexedSource,
  IndexedSourceDescriptor,
  IndexedSourceHealth,
  IndexedSourcePermissionState,
  IndexedSourceReconcileRequest,
  IndexedSourceReconcileResult,
  IndexedSourceRecordBatch,
  IndexedSourceResetRequest,
  IndexedSourceResetResult,
  IndexedSourceRoot,
  IndexedSourceScanRequest
} from '@talex-touch/utils/search'
import { fileProvider } from '../addon/files/file-provider'

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

export function buildFileIndexedSource(): IndexedSource {
  const descriptor = buildFileIndexedSourceDescriptor()

  return {
    descriptor,
    getHealth: getFileIndexedSourceHealth,
    getRoots: async () => buildRoots(descriptor.id, fileProvider.getWatchedPaths()),
    getEvidence: async () => await fileProvider.getIndexedSourceEvidence(),
    shouldHandleWatchEvent: (event) => fileProvider.ownsWatchPath(event.path),
    async *scan(request: IndexedSourceScanRequest): AsyncIterable<IndexedSourceRecordBatch> {
      const result = await fileProvider.scanIndexedSource(request)
      for (const batch of result?.batches ?? []) {
        if (batch.records.length > 0) {
          yield batch
        }
      }
    },
    reconcile: async (
      request: IndexedSourceReconcileRequest
    ): Promise<IndexedSourceReconcileResult> => {
      return await fileProvider.reconcileIndexedSource(request)
    },
    handleWatchEvent: async (event) => await fileProvider.handleIndexedSourceWatchEvent(event),
    resetIndex: async (request: IndexedSourceResetRequest): Promise<IndexedSourceResetResult> => {
      return await fileProvider.resetIndexedSourceRuntimeState(request)
    },
    clearIndex: async () => {
      const result = await fileProvider.rebuildIndex({ force: true })
      if (!result.success) {
        throw new Error(result.error || result.reason || 'file-index-clear-failed')
      }
    }
  }
}
