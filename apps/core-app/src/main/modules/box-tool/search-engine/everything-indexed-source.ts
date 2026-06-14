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
import process from 'node:process'
import { everythingProvider } from '../addon/files/everything-provider'
import { indexingRootPolicy } from './indexing-root-policy'

export const EVERYTHING_INDEXED_SOURCE_ID = 'everything-provider'

export function buildEverythingIndexedSourceDescriptor(): IndexedSourceDescriptor {
  return {
    id: EVERYTHING_INDEXED_SOURCE_ID,
    kind: 'file',
    displayName: 'Everything',
    platforms: ['win32'],
    priority: 'fast',
    storage: 'external-fast',
    privacy: 'medium',
    capabilities: {
      scan: false,
      watch: false,
      reconcile: true,
      clear: false,
      open: true
    },
    admission: {
      owner: 'core',
      permissionScopes: ['external-tool', 'file-system'],
      defaultState: 'enabled',
      clearable: false,
      rebuildable: false
    }
  }
}

async function* emptyScan(
  _request: IndexedSourceScanRequest
): AsyncIterable<IndexedSourceRecordBatch> {}

function buildEverythingHealth(): IndexedSourceHealth {
  const status = everythingProvider.getStatusSnapshot()
  const unsupported = process.platform !== 'win32'
  const rootResolution = indexingRootPolicy.resolveFileSearchRoots()
  const rootPolicyReason = rootResolution.roots.length > 0 ? null : rootResolution.reason
  const healthStatus: IndexedSourceHealth['status'] = unsupported
    ? 'unsupported'
    : !status.enabled
      ? 'disabled'
      : status.available && rootResolution.roots.length > 0
        ? 'ready'
        : 'degraded'

  const reason =
    status.healthReason ??
    status.error ??
    (!unsupported && status.enabled ? rootPolicyReason : null) ??
    status.pathFiltering.reason ??
    undefined

  return {
    status: healthStatus,
    permissionState: 'not-required',
    itemCount: 0,
    watchState: 'not-supported',
    reconcileState: 'idle',
    reason,
    lastIndexedAt: status.lastChecked ?? undefined,
    lastScanCompletedAt: status.lastChecked ?? undefined,
    lastError: status.error ?? status.lastBackendError ?? undefined
  }
}

function buildEverythingRoots(sourceId: string): IndexedSourceRoot[] {
  return indexingRootPolicy.resolveFileSearchRoots().roots.map((root) => ({
    ...root,
    sourceId,
    reason: root.reason ?? 'mirrors-file-index-root-policy'
  }))
}

function buildEverythingEvidence(sourceId: string): IndexedSourceEvidence[] {
  const status = everythingProvider.getStatusSnapshot()
  const roots = indexingRootPolicy.resolveFileSearchRoots().roots
  const health = buildEverythingHealth()
  const pathFiltering = status.pathFiltering

  return [
    {
      id: `${sourceId}:external-backend`,
      label: 'Everything external backend',
      status: health.status,
      itemCount: pathFiltering.lastFilteredResultCount ?? 0,
      rootCount: roots.length,
      lastCheckedAt: status.lastChecked ?? pathFiltering.lastChecked ?? undefined,
      reason: health.reason,
      metadata: {
        backend: status.backend,
        available: status.available,
        enabled: status.enabled,
        pathFiltering: {
          enabled: pathFiltering.enabled,
          allowedRootCount: pathFiltering.allowedRootCount,
          lastRawResultCount: pathFiltering.lastRawResultCount,
          lastFilteredResultCount: pathFiltering.lastFilteredResultCount,
          lastDroppedResultCount: pathFiltering.lastDroppedResultCount,
          reason: pathFiltering.reason
        },
        storage: 'external-fast'
      }
    }
  ]
}

export function buildEverythingIndexedSource(): IndexedSource {
  const descriptor = buildEverythingIndexedSourceDescriptor()

  return {
    descriptor,
    getHealth: async () => buildEverythingHealth(),
    getRoots: async () => buildEverythingRoots(descriptor.id),
    getEvidence: async () => buildEverythingEvidence(descriptor.id),
    scan: emptyScan,
    reconcile: async (
      _request: IndexedSourceReconcileRequest
    ): Promise<IndexedSourceReconcileResult> => {
      const startedAt = Date.now()
      return {
        sourceId: descriptor.id,
        added: 0,
        changed: 0,
        deleted: 0,
        skipped: 0,
        errors: 0,
        startedAt,
        completedAt: Date.now(),
        reason: 'external-fast-root-policy-refresh'
      }
    }
  }
}
