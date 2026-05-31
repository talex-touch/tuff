import type {
  IndexedSourceDiagnostics,
  IndexedSourceTaskKind,
  IndexedSourceTaskSkipReason
} from './indexing-source'
import {
  getIndexedSourceAdmissionIssues,
  resolveIndexedSourceTaskEligibility
} from './indexing-source'

export type IndexedSourceMaintenanceAction = 'scan' | 'reconcile' | 'reset'

export type IndexedSourceMaintenanceActionBlockReason =
  | IndexedSourceTaskSkipReason
  | `admission:${string}`
  | 'capability:reset-not-supported'
  | 'capability:reset-not-clearable'
  | 'lifecycle:reset-handler-missing'
  | 'lifecycle:clear-handler-missing'
  | 'health:unsupported'
  | 'diagnostics:unavailable'

export interface IndexedSourceMaintenanceActionState {
  action: IndexedSourceMaintenanceAction
  enabled: boolean
  reason?: IndexedSourceMaintenanceActionBlockReason
}

export function resolveIndexedSourceMaintenanceAction(
  source: IndexedSourceDiagnostics | null | undefined,
  action: IndexedSourceMaintenanceAction
): IndexedSourceMaintenanceActionState {
  if (!source) {
    return {
      action,
      enabled: false,
      reason: 'diagnostics:unavailable'
    }
  }

  if (action === 'scan' || action === 'reconcile') {
    return resolveTaskMaintenanceAction(source, action)
  }

  return resolveResetMaintenanceAction(source)
}

export function resolveIndexedSourceMaintenanceActions(
  source: IndexedSourceDiagnostics | null | undefined,
  actions: IndexedSourceMaintenanceAction[] = ['scan', 'reconcile', 'reset']
): IndexedSourceMaintenanceActionState[] {
  return actions.map((action) => resolveIndexedSourceMaintenanceAction(source, action))
}

function resolveTaskMaintenanceAction(
  source: IndexedSourceDiagnostics,
  task: Extract<IndexedSourceMaintenanceAction, IndexedSourceTaskKind>
): IndexedSourceMaintenanceActionState {
  const eligibility = resolveIndexedSourceTaskEligibility({
    descriptor: source.descriptor,
    health: source.health,
    task
  })

  return {
    action: task,
    enabled: eligibility.eligible,
    reason: eligibility.reason
  }
}

function resolveResetMaintenanceAction(
  source: IndexedSourceDiagnostics
): IndexedSourceMaintenanceActionState {
  const admissionIssues = getIndexedSourceAdmissionIssues(source.descriptor)
  if (admissionIssues.length > 0) {
    return {
      action: 'reset',
      enabled: false,
      reason: `admission:${admissionIssues.join(',')}`
    }
  }

  if (source.health.status === 'unsupported') {
    return {
      action: 'reset',
      enabled: false,
      reason: 'health:unsupported'
    }
  }

  const canReset = source.descriptor.capabilities.reset === true
  const canClear = source.descriptor.capabilities.clear === true
  if (!canReset && !canClear) {
    return {
      action: 'reset',
      enabled: false,
      reason: 'capability:reset-not-supported'
    }
  }

  if (source.descriptor.admission && !source.descriptor.admission.clearable) {
    return {
      action: 'reset',
      enabled: false,
      reason: 'capability:reset-not-clearable'
    }
  }

  if (canReset && source.lifecycleIssues?.includes('reset-capability-missing-handler')) {
    return {
      action: 'reset',
      enabled: false,
      reason: 'lifecycle:reset-handler-missing'
    }
  }

  if (canClear && source.lifecycleIssues?.includes('clear-capability-missing-handler')) {
    return {
      action: 'reset',
      enabled: false,
      reason: 'lifecycle:clear-handler-missing'
    }
  }

  return {
    action: 'reset',
    enabled: true
  }
}
