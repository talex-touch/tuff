import type {
  IndexedSource,
  IndexedSourceDescriptor,
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

  return {
    status: unsupported
      ? 'unsupported'
      : status.enabled && status.available
        ? 'ready'
        : status.enabled
          ? 'degraded'
          : 'disabled',
    permissionState: 'not-required',
    itemCount: 0,
    watchState: 'not-supported',
    reconcileState: 'idle',
    reason: status.healthReason ?? status.error ?? status.pathFiltering.reason ?? undefined,
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

export function buildEverythingIndexedSource(): IndexedSource {
  const descriptor = buildEverythingIndexedSourceDescriptor()

  return {
    descriptor,
    getHealth: async () => buildEverythingHealth(),
    getRoots: async () => buildEverythingRoots(descriptor.id),
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
