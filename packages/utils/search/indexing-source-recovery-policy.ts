import type {
  IndexedSourceDiagnostics,
  IndexedSourceProgressStatus,
  IndexedSourceTaskHistoryEntry
} from './indexing-source'
import type {
  IndexedSourceMaintenanceAction,
  IndexedSourceMaintenanceActionBlockReason
} from './indexing-source-maintenance-action'
import { resolveIndexedSourceMaintenanceActions } from './indexing-source-maintenance-action'

export type IndexedSourceRecoveryAction =
  | 'none'
  | 'wait'
  | 'grant-permission'
  | 'enable-provider'
  | 'scan'
  | 'reconcile'
  | 'reset'
  | 'inspect-contract'
  | 'inspect-source'

export type IndexedSourceRecoveryPriority = 'none' | 'low' | 'medium' | 'high'

export interface IndexedSourceRecoveryRecommendation {
  action: IndexedSourceRecoveryAction
  priority: IndexedSourceRecoveryPriority
  reason?: string
  maintenanceAction?: IndexedSourceMaintenanceAction
  blockedReason?: IndexedSourceMaintenanceActionBlockReason
}

export function resolveIndexedSourceRecoveryRecommendation(
  source: IndexedSourceDiagnostics | null | undefined
): IndexedSourceRecoveryRecommendation {
  if (!source) {
    return {
      action: 'inspect-source',
      priority: 'high',
      reason: 'diagnostics:unavailable'
    }
  }

  const admissionIssue = source.admissionIssues?.[0]
  if (admissionIssue) {
    return {
      action: 'inspect-contract',
      priority: 'high',
      reason: `admission:${admissionIssue}`
    }
  }

  const lifecycleIssue = source.lifecycleIssues?.[0]
  if (lifecycleIssue) {
    return {
      action: 'inspect-contract',
      priority: 'medium',
      reason: `lifecycle:${lifecycleIssue}`
    }
  }

  const progressRecommendation = resolveProgressRecoveryRecommendation(source)
  if (progressRecommendation) return progressRecommendation

  const permissionRecommendation = resolvePermissionRecoveryRecommendation(source)
  if (permissionRecommendation) return permissionRecommendation

  const latestTaskRecommendation = resolveLatestTaskRecoveryRecommendation(source)
  if (latestTaskRecommendation) return latestTaskRecommendation

  if (source.health.status === 'error') {
    return resolveMaintenanceRecovery(source, ['reset', 'reconcile', 'scan'], 'high', 'health:error')
  }

  if (source.health.status === 'degraded') {
    return resolveMaintenanceRecovery(
      source,
      ['reconcile', 'scan', 'reset'],
      'medium',
      source.health.reason ?? 'health:degraded'
    )
  }

  if (source.health.status === 'warming') {
    return {
      action: 'wait',
      priority: 'low',
      reason: source.health.reason ?? 'health:warming'
    }
  }

  if (source.health.status === 'unsupported') {
    return {
      action: 'inspect-source',
      priority: 'low',
      reason: source.health.reason ?? 'health:unsupported'
    }
  }

  return {
    action: 'none',
    priority: 'none'
  }
}

function resolveProgressRecoveryRecommendation(
  source: IndexedSourceDiagnostics
): IndexedSourceRecoveryRecommendation | null {
  const status = source.progress?.status
  if (!status) return null

  if (status === 'failed' || status === 'stalled') {
    return resolveMaintenanceRecovery(
      source,
      ['reset', 'reconcile', 'scan'],
      'high',
      source.progress?.reason ?? `progress:${status}`
    )
  }

  if (isRunningProgressStatus(status)) {
    return {
      action: 'wait',
      priority: 'low',
      reason: `progress:${status}`
    }
  }

  return null
}

function resolvePermissionRecoveryRecommendation(
  source: IndexedSourceDiagnostics
): IndexedSourceRecoveryRecommendation | null {
  if (
    source.health.status === 'permission-required' ||
    source.health.permissionState === 'denied' ||
    source.health.permissionState === 'promptable'
  ) {
    return {
      action: 'grant-permission',
      priority: 'high',
      reason: source.health.reason ?? `permission:${source.health.permissionState}`
    }
  }

  if (source.health.status === 'disabled') {
    return {
      action: 'enable-provider',
      priority: 'medium',
      reason: source.health.reason ?? 'health:disabled'
    }
  }

  return null
}

function resolveLatestTaskRecoveryRecommendation(
  source: IndexedSourceDiagnostics
): IndexedSourceRecoveryRecommendation | null {
  const task = source.recentTasks?.[0]
  if (!task || task.status === 'succeeded') return null

  const skippedReason = normalizeSkippedReason(task.error)
  if (skippedReason?.includes('permission') || skippedReason?.includes('root-permission')) {
    return {
      action: 'grant-permission',
      priority: 'high',
      reason: skippedReason
    }
  }

  if (skippedReason?.includes('health:disabled')) {
    return {
      action: 'enable-provider',
      priority: 'medium',
      reason: skippedReason
    }
  }

  if (task.kind === 'watch') {
    return resolveMaintenanceRecovery(
      source,
      ['reconcile', 'scan', 'reset'],
      task.status === 'failed' ? 'high' : 'medium',
      resolveTaskReason(task)
    )
  }

  if (task.kind === 'scan') {
    return resolveMaintenanceRecovery(
      source,
      ['scan', 'reset', 'reconcile'],
      task.status === 'failed' ? 'high' : 'medium',
      resolveTaskReason(task)
    )
  }

  if (task.kind === 'reconcile') {
    return resolveMaintenanceRecovery(
      source,
      ['reconcile', 'reset', 'scan'],
      task.status === 'failed' ? 'high' : 'medium',
      resolveTaskReason(task)
    )
  }

  return resolveMaintenanceRecovery(
    source,
    ['reset', 'scan', 'reconcile'],
    task.status === 'failed' ? 'high' : 'medium',
    resolveTaskReason(task)
  )
}

function resolveMaintenanceRecovery(
  source: IndexedSourceDiagnostics,
  actions: IndexedSourceMaintenanceAction[],
  priority: IndexedSourceRecoveryPriority,
  reason?: string
): IndexedSourceRecoveryRecommendation {
  const states = resolveIndexedSourceMaintenanceActions(source, actions)
  const enabled = states.find((state) => state.enabled)
  if (enabled) {
    return {
      action: enabled.action,
      maintenanceAction: enabled.action,
      priority,
      reason
    }
  }

  return {
    action: 'inspect-source',
    priority,
    reason,
    blockedReason: states.find((state) => state.reason)?.reason
  }
}

function isRunningProgressStatus(status: IndexedSourceProgressStatus): boolean {
  return status === 'running' || status === 'estimated' || status === 'stabilizing'
}

function normalizeSkippedReason(error: string | undefined): string | null {
  if (!error?.startsWith('skipped:')) return null
  return error.slice('skipped:'.length)
}

function resolveTaskReason(task: IndexedSourceTaskHistoryEntry): string {
  return task.error || `task:${task.kind}:${task.status}`
}
