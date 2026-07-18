import type {
  IndexedSource,
  IndexedSourceDescriptor,
  IndexedSourceOpenResult,
  IndexedSourceRecord,
  IndexedSourceReconcileRequest,
  IndexedSourceReconcileResult,
  IndexedSourceRecordBatch,
  IndexedSourceResetRequest,
  IndexedSourceResetResult,
  IndexedSourceScanRequest
} from '@talex-touch/utils/search'
import { appProvider } from '../addon/apps/app-provider'
import type { AppLaunchKind } from '../addon/apps/app-types'
import { isWindowsUwpShellPath } from '../addon/apps/app-provider-path-utils'

export const APP_INDEXED_SOURCE_ID = 'app-provider'

function readRecordMetadataString(record: IndexedSourceRecord, key: string): string | undefined {
  const value = record.metadata?.[key]
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function isAppLaunchKind(value: unknown): value is AppLaunchKind {
  return value === 'path' || value === 'shortcut' || value === 'uwp' || value === 'protocol'
}

async function openAppIndexedSourceRecord(
  record: IndexedSourceRecord
): Promise<IndexedSourceOpenResult> {
  if (!record.path) {
    return {
      status: 'blocked',
      reason: 'app-path-missing'
    }
  }

  const metadataLaunchKind = record.metadata?.launchKind
  const launchKind = isAppLaunchKind(metadataLaunchKind) ? metadataLaunchKind : 'path'
  const rawLaunchTarget =
    readRecordMetadataString(record, 'launchTarget') ?? record.uri ?? record.path
  const launchTarget =
    launchKind === 'uwp' && isWindowsUwpShellPath(rawLaunchTarget)
      ? rawLaunchTarget.replace(/^shell:AppsFolder\\/i, '')
      : rawLaunchTarget
  const { launchApp } = await import('../addon/apps/app-launcher')
  const outcome = await launchApp({
    name: record.title,
    path: record.path,
    launchKind,
    launchTarget,
    launchArgs: readRecordMetadataString(record, 'launchArgs'),
    workingDirectory: readRecordMetadataString(record, 'workingDirectory'),
    sourceItemId: record.recordId
  })

  return outcome.status === 'failed'
    ? { status: 'failed', reason: outcome.error ?? 'app-launch-failed' }
    : { status: 'started' }
}

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
      const controller = new AbortController()
      const abort = () => controller.abort(request.signal?.reason)
      if (request.signal?.aborted) abort()
      request.signal?.addEventListener('abort', abort, { once: true })
      const iterator = appProvider
        .scanIndexedSource({ ...request, signal: controller.signal })
        [Symbol.asyncIterator]()
      try {
        while (true) {
          const next = await iterator.next()
          if (next.done) return
          const batch = next.value
          if (batch.records.length > 0 || batch.done === true) yield batch
        }
      } finally {
        request.signal?.removeEventListener('abort', abort)
        controller.abort(new Error('app-indexed-source-consumer-closed'))
        await iterator.return?.()
      }
    },
    reconcile: async (
      request: IndexedSourceReconcileRequest
    ): Promise<IndexedSourceReconcileResult> => {
      return await appProvider.reconcileIndexedSource(request)
    },
    handleWatchEvent: async (event) => await appProvider.handleIndexedSourceWatchEvent(event),
    open: openAppIndexedSourceRecord,
    resetIndex: async (request: IndexedSourceResetRequest): Promise<IndexedSourceResetResult> => {
      return await appProvider.resetIndexedSourceLocalState(request)
    },
    clearIndex: async () => {
      const result = await appProvider.rebuildIndex()
      if (!result.success) throw new Error(result.error ?? 'APP_INDEX_REBUILD_FAILED')
    }
  }
}
