import type {
  IndexedSourceHealth,
  IndexedSourcePermissionState,
  IndexedSourceReconcileState,
  IndexedSourceWatchState
} from './indexing-source'

export interface IndexedSourceErrorHealthOptions {
  permissionState?: IndexedSourcePermissionState
  itemCount?: number
  watchState?: IndexedSourceWatchState
  reconcileState?: IndexedSourceReconcileState
  reason?: string
}

export function getIndexedSourceErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error ?? 'unknown')
}

export function buildIndexedSourceErrorHealth(
  error: unknown,
  options: IndexedSourceErrorHealthOptions = {}
): IndexedSourceHealth {
  return {
    status: 'error',
    permissionState: options.permissionState ?? 'not-required',
    itemCount: options.itemCount ?? 0,
    watchState: options.watchState ?? 'unavailable',
    reconcileState: options.reconcileState ?? 'failed',
    reason: options.reason,
    lastError: getIndexedSourceErrorMessage(error)
  }
}
