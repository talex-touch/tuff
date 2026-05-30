import type {
  IndexedSource,
  IndexedSourceDescriptor,
  IndexedSourceReconcileRequest,
  IndexedSourceReconcileResult,
  IndexedSourceRecordBatch,
  IndexedSourceScanRequest
} from '@talex-touch/utils/search'
import { appProvider } from '../addon/apps/app-provider'

export const APP_INDEXED_SOURCE_ID = 'app-provider'

export function buildAppIndexedSourceDescriptor(): IndexedSourceDescriptor {
  return {
    id: APP_INDEXED_SOURCE_ID,
    kind: 'app',
    displayName: 'Applications',
    platforms: ['darwin', 'win32', 'linux'],
    priority: 'fast',
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
      permissionScopes: ['none'],
      defaultState: 'enabled',
      clearable: true,
      rebuildable: true
    }
  }
}

export function buildAppIndexedSource(): IndexedSource {
  const descriptor = buildAppIndexedSourceDescriptor()

  return {
    descriptor,
    getHealth: async () => await appProvider.getIndexedSourceHealth(),
    getRoots: async () => appProvider.getIndexedSourceRoots(),
    getEvidence: async () => await appProvider.getIndexedSourceEvidence(),
    async *scan(request: IndexedSourceScanRequest): AsyncIterable<IndexedSourceRecordBatch> {
      const batch = await appProvider.scanIndexedSource(request)
      if (batch && batch.records.length > 0) {
        yield batch
      }
    },
    reconcile: async (
      request: IndexedSourceReconcileRequest
    ): Promise<IndexedSourceReconcileResult> => {
      return await appProvider.reconcileIndexedSource(request)
    },
    handleWatchEvent: async (event) => await appProvider.handleIndexedSourceWatchEvent(event),
    clearIndex: async () => {
      await appProvider.rebuildIndex()
    }
  }
}
