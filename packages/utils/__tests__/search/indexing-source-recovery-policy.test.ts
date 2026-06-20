import type { IndexedSourceDiagnostics } from '../../search'
import { describe, expect, it } from 'vitest'
import { resolveIndexedSourceRecoveryRecommendation } from '../../search'

function buildSource(
  overrides: Partial<IndexedSourceDiagnostics> = {}
): IndexedSourceDiagnostics {
  return {
    descriptor: {
      id: 'file-provider',
      kind: 'file',
      displayName: 'File',
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
    },
    health: {
      status: 'ready',
      permissionState: 'granted',
      itemCount: 12,
      watchState: 'active',
      reconcileState: 'idle'
    },
    roots: [],
    ...overrides
  }
}

describe('indexed source recovery policy', () => {
  it('returns no-op for a healthy source without failed tasks', () => {
    expect(resolveIndexedSourceRecoveryRecommendation(buildSource())).toEqual({
      action: 'none',
      priority: 'none'
    })
  })

  it('prioritizes admission and lifecycle contract issues before runtime recovery', () => {
    expect(
      resolveIndexedSourceRecoveryRecommendation(
        buildSource({
          admissionIssues: ['persistent-source-must-be-clearable'],
          progress: {
            sourceId: 'file-provider',
            stage: 'scan',
            status: 'failed',
            current: 1,
            total: 10,
            progress: 10,
            reason: 'worker-failed'
          }
        })
      )
    ).toEqual({
      action: 'inspect-contract',
      priority: 'high',
      reason: 'admission:persistent-source-must-be-clearable'
    })

    expect(
      resolveIndexedSourceRecoveryRecommendation(
        buildSource({
          lifecycleIssues: ['watch-capability-missing-handler']
        })
      )
    ).toEqual({
      action: 'inspect-contract',
      priority: 'medium',
      reason: 'lifecycle:watch-capability-missing-handler'
    })
  })

  it('turns permission and disabled source states into product recovery actions', () => {
    expect(
      resolveIndexedSourceRecoveryRecommendation(
        buildSource({
          health: {
            status: 'permission-required',
            permissionState: 'denied',
            itemCount: 0,
            watchState: 'pending-permission',
            reconcileState: 'idle'
          }
        })
      )
    ).toEqual({
      action: 'grant-permission',
      priority: 'high',
      reason: 'permission:denied'
    })

    expect(
      resolveIndexedSourceRecoveryRecommendation(
        buildSource({
          health: {
            status: 'disabled',
            permissionState: 'granted',
            itemCount: 0,
            watchState: 'not-supported',
            reconcileState: 'idle'
          }
        })
      )
    ).toEqual({
      action: 'enable-provider',
      priority: 'medium',
      reason: 'health:disabled'
    })
  })

  it('suggests reset for stalled progress when reset is available', () => {
    expect(
      resolveIndexedSourceRecoveryRecommendation(
        buildSource({
          progress: {
            sourceId: 'file-provider',
            stage: 'scan',
            status: 'stalled',
            current: 40,
            total: 100,
            progress: 40,
            reason: 'no-progress'
          }
        })
      )
    ).toEqual({
      action: 'reset',
      maintenanceAction: 'reset',
      priority: 'high',
      reason: 'no-progress'
    })
  })

  it('uses reconcile as the first recovery action after watch failures', () => {
    expect(
      resolveIndexedSourceRecoveryRecommendation(
        buildSource({
          recentTasks: [
            {
              kind: 'watch',
              status: 'failed',
              completedAt: 1700000000000,
              error: 'store failed'
            }
          ]
        })
      )
    ).toEqual({
      action: 'reconcile',
      maintenanceAction: 'reconcile',
      priority: 'high',
      reason: 'store failed'
    })
  })

  it('suggests reset first when scan fails while applying runtime store batches', () => {
    expect(
      resolveIndexedSourceRecoveryRecommendation(
        buildSource({
          recentTasks: [
            {
              kind: 'scan',
              status: 'failed',
              completedAt: 1700000000000,
              error: 'sqlite busy',
              summary: {
                phase: 'store',
                batches: 0,
                records: 0,
                indexedRecords: 0
              }
            }
          ]
        })
      )
    ).toEqual({
      action: 'reset',
      maintenanceAction: 'reset',
      priority: 'high',
      reason: 'task:scan:store-failed'
    })
  })

  it('keeps scan as the first recovery action for source-phase scan failures', () => {
    expect(
      resolveIndexedSourceRecoveryRecommendation(
        buildSource({
          recentTasks: [
            {
              kind: 'scan',
              status: 'failed',
              completedAt: 1700000000000,
              error: 'scanner crashed'
            }
          ]
        })
      )
    ).toEqual({
      action: 'scan',
      maintenanceAction: 'scan',
      priority: 'high',
      reason: 'scanner crashed'
    })
  })

  it('uses the task with the latest completedAt when recent task history is not sorted', () => {
    expect(
      resolveIndexedSourceRecoveryRecommendation(
        buildSource({
          recentTasks: [
            {
              kind: 'scan',
              status: 'succeeded',
              completedAt: 1700000000000
            },
            {
              kind: 'watch',
              status: 'failed',
              completedAt: 1700000005000,
              error: 'watch route failed'
            }
          ]
        })
      )
    ).toEqual({
      action: 'reconcile',
      maintenanceAction: 'reconcile',
      priority: 'high',
      reason: 'watch route failed'
    })
  })

  it('ignores invalid completedAt values when selecting the latest task', () => {
    expect(
      resolveIndexedSourceRecoveryRecommendation(
        buildSource({
          recentTasks: [
            {
              kind: 'scan',
              status: 'failed',
              completedAt: Number.POSITIVE_INFINITY,
              error: 'bad persisted timestamp'
            },
            {
              kind: 'watch',
              status: 'failed',
              completedAt: 1700000005000,
              error: 'watch route failed'
            }
          ]
        })
      )
    ).toEqual({
      action: 'reconcile',
      maintenanceAction: 'reconcile',
      priority: 'high',
      reason: 'watch route failed'
    })
  })

  it('returns no-op when recent task history only contains invalid completedAt values', () => {
    expect(
      resolveIndexedSourceRecoveryRecommendation(
        buildSource({
          recentTasks: [
            {
              kind: 'scan',
              status: 'failed',
              completedAt: Number.NaN,
              error: 'bad persisted timestamp'
            }
          ]
        })
      )
    ).toEqual({
      action: 'none',
      priority: 'none'
    })
  })

  it('waits when the latest automatic task was skipped by retry-window backoff', () => {
    expect(
      resolveIndexedSourceRecoveryRecommendation(
        buildSource({
          recentTasks: [
            {
              kind: 'scan',
              status: 'skipped',
              completedAt: 1700000000000,
              error: 'skipped:retry-window:scan:1700000030000'
            }
          ]
        })
      )
    ).toEqual({
      action: 'wait',
      priority: 'low',
      reason: 'retry-window:scan:1700000030000'
    })

    expect(
      resolveIndexedSourceRecoveryRecommendation(
        buildSource({
          recentTasks: [
            {
              kind: 'reconcile',
              status: 'skipped',
              completedAt: 1700000000000,
              error: 'skipped:retry-window:reconcile:1700000030000'
            }
          ]
        })
      )
    ).toEqual({
      action: 'wait',
      priority: 'low',
      reason: 'retry-window:reconcile:1700000030000'
    })
  })

  it('falls back to inspect-source when all maintenance actions are blocked', () => {
    expect(
      resolveIndexedSourceRecoveryRecommendation(
        buildSource({
          descriptor: {
            ...buildSource().descriptor,
            capabilities: {
              scan: false,
              watch: true,
              reconcile: false,
              reset: false,
              clear: false,
              open: true
            }
          },
          recentTasks: [
            {
              kind: 'watch',
              status: 'failed',
              completedAt: 1700000000000,
              error: 'handler failed'
            }
          ]
        })
      )
    ).toEqual({
      action: 'inspect-source',
      priority: 'high',
      reason: 'handler failed',
      blockedReason: 'admission:watch-capability-requires-reconcile'
    })
  })
})
