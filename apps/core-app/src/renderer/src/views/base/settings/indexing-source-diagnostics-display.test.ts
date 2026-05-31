import type { IndexedSourceDiagnostics } from '@talex-touch/utils/search'
import { describe, expect, it } from 'vitest'
import {
  countIndexingSourcesNeedingAttention,
  formatIndexingSourceTimestamp,
  resolveIndexingSourceAdmissionIssueChips,
  resolveIndexingSourceDetailKey,
  resolveIndexingSourceEvidenceChips,
  resolveIndexingSourceLifecycleIssueChips,
  resolveIndexingSourceMaintenanceActions,
  resolveIndexingSourceProgressChip,
  resolveIndexingSourceReconcileStateKey,
  resolveIndexingSourceRecentTaskChips,
  resolveIndexingSourceStatusKey,
  resolveIndexingSourceTaskChips,
  resolveIndexingSourceTone,
  resolveIndexingSourceWatchStateKey,
  summarizeIndexingSourceRoots
} from './indexing-source-diagnostics-display'

function buildSource(overrides: Partial<IndexedSourceDiagnostics> = {}): IndexedSourceDiagnostics {
  return {
    descriptor: {
      id: 'file-provider',
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
    },
    health: {
      status: 'ready',
      permissionState: 'granted',
      itemCount: 10,
      watchState: 'active',
      reconcileState: 'idle',
      lastIndexedAt: 1700000000000
    },
    roots: [{ sourceId: 'file-provider', path: '/tmp/a', permissionState: 'granted' }],
    ...overrides
  }
}

describe('indexing source diagnostics display helpers', () => {
  it('maps source health statuses to stable tones and i18n keys', () => {
    expect(resolveIndexingSourceTone('ready')).toBe('success')
    expect(resolveIndexingSourceTone('degraded')).toBe('warning')
    expect(resolveIndexingSourceTone('error')).toBe('danger')
    expect(resolveIndexingSourceStatusKey('permission-required')).toBe(
      'settings.settingFileIndex.sourceStatus.permission-required'
    )
    expect(resolveIndexingSourceWatchStateKey('pending-permission')).toBe(
      'settings.settingFileIndex.sourceWatchState.pending-permission'
    )
    expect(resolveIndexingSourceReconcileStateKey('scheduled')).toBe(
      'settings.settingFileIndex.sourceReconcileState.scheduled'
    )
  })

  it('prioritizes error and reason details before timestamp and roots', () => {
    expect(
      resolveIndexingSourceDetailKey(buildSource({ health: { ...buildSource().health } }))
    ).toBe('lastIndexedAt')
    expect(
      resolveIndexingSourceDetailKey(
        buildSource({ health: { ...buildSource().health, reason: 'backend degraded' } })
      )
    ).toBe('reason')
    expect(
      resolveIndexingSourceDetailKey(
        buildSource({ health: { ...buildSource().health, lastError: 'worker failed' } })
      )
    ).toBe('lastError')
    expect(
      resolveIndexingSourceDetailKey(
        buildSource({
          admissionIssues: ['high-privacy-requires-explicit-enable'],
          lifecycleIssues: ['watch-capability-missing-handler'],
          health: { ...buildSource().health, reason: 'backend degraded' }
        })
      )
    ).toBe('admissionIssue')
    expect(
      resolveIndexingSourceDetailKey(
        buildSource({
          lifecycleIssues: ['watch-capability-missing-handler'],
          health: { ...buildSource().health, reason: 'backend degraded' }
        })
      )
    ).toBe('lifecycleIssue')
  })

  it('summarizes roots without expanding long lists in settings rows', () => {
    expect(
      summarizeIndexingSourceRoots(
        buildSource({
          roots: [
            { sourceId: 'file-provider', path: '/tmp/a', permissionState: 'granted' },
            { sourceId: 'file-provider', path: '/tmp/b', permissionState: 'granted' },
            { sourceId: 'file-provider', path: '/tmp/c', permissionState: 'granted' }
          ]
        })
      )
    ).toBe('/tmp/a, /tmp/b +1')
  })

  it('counts only degraded, permission-required, and error sources as attention', () => {
    expect(
      countIndexingSourcesNeedingAttention([
        buildSource({ health: { ...buildSource().health, status: 'ready' } }),
        buildSource({ health: { ...buildSource().health, status: 'warming' } }),
        buildSource({ health: { ...buildSource().health, status: 'degraded' } }),
        buildSource({ health: { ...buildSource().health, status: 'error' } }),
        buildSource({
          health: { ...buildSource().health, status: 'ready' },
          admissionIssues: ['persistent-source-must-be-clearable']
        }),
        buildSource({
          health: { ...buildSource().health, status: 'ready' },
          lifecycleIssues: ['open-capability-missing-handler']
        })
      ])
    ).toBe(4)
  })

  it('formats invalid timestamps as an empty marker', () => {
    expect(formatIndexingSourceTimestamp()).toBe('-')
    expect(formatIndexingSourceTimestamp(0)).toBe('-')
  })

  it('builds compact task chips from runtime task diagnostics', () => {
    const chips = resolveIndexingSourceTaskChips(
      buildSource({
        lastScan: {
          startedAt: 1700000000000,
          completedAt: 1700000000100,
          jobId: 'file-provider:scan:1',
          batches: 2,
          records: 20
        },
        lastWatch: {
          occurredAt: 1700000000200,
          completedAt: 1700000000300,
          jobId: 'file-provider:watch:1',
          action: 'change',
          path: '/tmp/a.txt',
          deltas: 1,
          appliedDeltas: 1,
          failedDeltas: 0
        },
        lastReconcile: {
          startedAt: 1700000000400,
          completedAt: 1700000000500,
          jobId: 'file-provider:reconcile:1',
          added: 1,
          changed: 2,
          deleted: 3,
          skipped: 4,
          errors: 0,
          reason: 'file-watch-root-recovered',
          rootCount: 1
        }
      })
    )

    expect(chips.map((chip) => chip.id)).toEqual(['scan', 'watch', 'reconcile'])
    expect(chips.map((chip) => chip.labelKey)).toEqual([
      'settings.settingFileIndex.sourceTask.scanDone',
      'settings.settingFileIndex.sourceTask.watchDone',
      'settings.settingFileIndex.sourceTask.reconcileDone'
    ])
    expect(chips[2].values).toMatchObject({
      jobId: 'file-provider:reconcile:1',
      reason: 'file-watch-root-recovered',
      rootCount: 1
    })
  })

  it('marks failed runtime task chips as danger', () => {
    const chips = resolveIndexingSourceTaskChips(
      buildSource({
        lastWatch: {
          occurredAt: 1700000000200,
          completedAt: 1700000000300,
          action: 'change',
          path: '/tmp/a.txt',
          deltas: 2,
          appliedDeltas: 1,
          failedDeltas: 1,
          error: 'store failed'
        }
      })
    )

    expect(chips).toHaveLength(1)
    expect(chips[0]?.tone).toBe('danger')
    expect(chips[0]?.labelKey).toBe('settings.settingFileIndex.sourceTask.watchFailed')
  })

  it('builds bounded recent task chips from runtime task history', () => {
    const chips = resolveIndexingSourceRecentTaskChips(
      buildSource({
        recentTasks: [
          {
            kind: 'reset',
            status: 'succeeded',
            completedAt: 1700000000600,
            jobId: 'file-provider:reset:1',
            summary: {
              clearedSearchIndex: true,
              clearedScanProgress: false
            }
          },
          {
            kind: 'watch',
            status: 'skipped',
            completedAt: 1700000000500,
            jobId: 'file-provider:watch:2',
            error: 'skipped:health:disabled',
            summary: {
              action: 'change',
              appliedDeltas: 0,
              deltas: 0
            }
          },
          {
            kind: 'scan',
            status: 'failed',
            completedAt: 1700000000400,
            jobId: 'file-provider:scan:3',
            error: 'scan failed',
            summary: {
              batches: 2,
              records: 18
            }
          },
          {
            kind: 'reconcile',
            status: 'succeeded',
            completedAt: 1700000000300,
            jobId: 'file-provider:reconcile:4'
          }
        ]
      })
    )

    expect(chips).toHaveLength(3)
    expect(chips.map((chip) => chip.labelKey)).toEqual([
      'settings.settingFileIndex.sourceRecentTask.reset.succeeded',
      'settings.settingFileIndex.sourceRecentTask.watch.skipped',
      'settings.settingFileIndex.sourceRecentTask.scan.failed'
    ])
    expect(chips.map((chip) => chip.tone)).toEqual(['muted', 'warning', 'danger'])
    expect(chips[1].values).toMatchObject({
      jobId: 'file-provider:watch:2',
      summary: 'delta 0/0 / action change',
      error: 'skipped:health:disabled'
    })
    expect(chips[0].values.summary).toBe('clear index yes / progress no')
    expect(chips[2].values.summary).toBe('records 18 / batches 2')
  })

  it('builds prioritized evidence chips from source evidence', () => {
    const chips = resolveIndexingSourceEvidenceChips(
      buildSource({
        evidence: [
          {
            id: 'file-provider:scan-progress',
            label: 'File scan progress',
            status: 'ready',
            itemCount: 12,
            reason: 'scan-progress-ready',
            metadata: {
              totalFiles: 12,
              completedFiles: 12,
              failedFiles: 0,
              pendingPermissionRoots: 0
            }
          },
          {
            id: 'file-provider:index-flush',
            label: 'File index flush',
            status: 'degraded',
            itemCount: 3,
            reason: 'worker-not-ready',
            metadata: {
              status: 'worker-not-ready',
              entries: 3,
              pending: 6,
              inflight: 3,
              withContent: 2,
              durationMs: 1350
            }
          },
          {
            id: 'file-provider:integrity',
            label: 'File index integrity',
            status: 'ready',
            itemCount: 12,
            reason: 'fts-files-count-aligned',
            metadata: {
              ftsRows: 12,
              filesRows: 12,
              needsRebuild: false,
              orphanedKeywordsRemoved: 0
            }
          }
        ]
      })
    )

    expect(chips).toHaveLength(2)
    expect(chips.map((chip) => chip.id)).toEqual([
      'file-provider:index-flush',
      'file-provider:integrity'
    ])
    expect(chips[0]).toMatchObject({
      tone: 'warning',
      labelKey: 'settings.settingFileIndex.sourceEvidenceChip.indexFlush',
      values: {
        label: 'File index flush',
        status: 'degraded',
        count: 3,
        reason: 'worker-not-ready',
        entries: 3,
        pending: 6,
        inflight: 3,
        withContent: 2,
        duration: '1.4s'
      }
    })
    expect(chips[1]).toMatchObject({
      labelKey: 'settings.settingFileIndex.sourceEvidenceChip.integrity',
      values: {
        ftsRows: 12,
        filesRows: 12,
        needsRebuild: 'no',
        orphanedKeywordsRemoved: 0
      }
    })
  })

  it('returns null when source progress diagnostics are unavailable', () => {
    expect(resolveIndexingSourceProgressChip(buildSource())).toBeNull()
  })

  it('builds an estimated progress chip with bounded percentage and ETA values', () => {
    const chip = resolveIndexingSourceProgressChip(
      buildSource({
        progress: {
          sourceId: 'file-provider',
          stage: 'scan',
          status: 'estimated',
          current: 42,
          total: 100,
          progress: 42.4,
          estimatedRemainingMs: 125000,
          estimatedCompletionAt: 1700000125000,
          averageItemsPerSecond: 3.42,
          speedSampleCount: 4,
          estimateBasis: 'stage-speed'
        }
      })
    )

    expect(chip).toMatchObject({
      id: 'file-provider:progress',
      tone: 'info',
      labelKey: 'settings.settingFileIndex.sourceProgressChip.estimated',
      values: {
        stage: 'scan',
        status: 'estimated',
        percent: 42,
        current: 42,
        total: 100,
        remaining: '3m',
        speed: '3.4',
        samples: 4,
        basis: 'stage-speed'
      }
    })
    expect(chip?.values.eta).not.toBe('-')
  })

  it('maps stabilizing, stalled, failed, and complete progress status to product tones', () => {
    expect(
      resolveIndexingSourceProgressChip(
        buildSource({
          progress: {
            sourceId: 'file-provider',
            stage: 'scan',
            status: 'stabilizing',
            current: 2,
            total: 100,
            progress: 2,
            speedSampleCount: 1
          }
        })
      )?.tone
    ).toBe('warning')
    expect(
      resolveIndexingSourceProgressChip(
        buildSource({
          progress: {
            sourceId: 'file-provider',
            stage: 'scan',
            status: 'stalled',
            current: 2,
            total: 100,
            progress: 2,
            reason: 'no-progress'
          }
        })
      )
    ).toMatchObject({
      tone: 'danger',
      labelKey: 'settings.settingFileIndex.sourceProgressChip.stalled',
      values: {
        reason: 'no-progress'
      }
    })
    expect(
      resolveIndexingSourceProgressChip(
        buildSource({
          progress: {
            sourceId: 'file-provider',
            stage: 'completed',
            status: 'complete',
            current: 100,
            total: 100,
            progress: 100
          }
        })
      )?.tone
    ).toBe('success')
    expect(
      resolveIndexingSourceProgressChip(
        buildSource({
          progress: {
            sourceId: 'file-provider',
            stage: 'scan',
            status: 'failed',
            current: 12,
            total: 100,
            progress: 12,
            reason: 'worker-failed'
          }
        })
      )
    ).toMatchObject({
      tone: 'danger',
      labelKey: 'settings.settingFileIndex.sourceProgressChip.failed',
      values: {
        reason: 'worker-failed'
      }
    })
  })

  it('builds bounded lifecycle issue chips from source diagnostics', () => {
    const chips = resolveIndexingSourceLifecycleIssueChips(
      buildSource({
        lifecycleIssues: [
          'watch-capability-missing-handler',
          'open-capability-missing-handler',
          'handler-provided-without-capability'
        ]
      })
    )

    expect(chips).toHaveLength(2)
    expect(chips).toEqual([
      {
        id: 'watch-capability-missing-handler:0',
        tone: 'warning',
        labelKey: 'settings.settingFileIndex.sourceLifecycleIssue.watch-capability-missing-handler',
        values: {
          issue: 'watch-capability-missing-handler'
        }
      },
      {
        id: 'open-capability-missing-handler:1',
        tone: 'warning',
        labelKey: 'settings.settingFileIndex.sourceLifecycleIssue.open-capability-missing-handler',
        values: {
          issue: 'open-capability-missing-handler'
        }
      }
    ])
  })

  it('builds bounded admission issue chips from source diagnostics', () => {
    const chips = resolveIndexingSourceAdmissionIssueChips(
      buildSource({
        admissionIssues: [
          'high-privacy-requires-explicit-enable',
          'browser-data-requires-high-privacy',
          'persistent-source-must-be-clearable'
        ]
      })
    )

    expect(chips).toHaveLength(2)
    expect(chips).toEqual([
      {
        id: 'high-privacy-requires-explicit-enable:0',
        tone: 'danger',
        labelKey:
          'settings.settingFileIndex.sourceAdmissionIssue.high-privacy-requires-explicit-enable',
        values: {
          issue: 'high-privacy-requires-explicit-enable'
        }
      },
      {
        id: 'browser-data-requires-high-privacy:1',
        tone: 'danger',
        labelKey:
          'settings.settingFileIndex.sourceAdmissionIssue.browser-data-requires-high-privacy',
        values: {
          issue: 'browser-data-requires-high-privacy'
        }
      }
    ])
  })

  it('resolves maintenance actions through the shared SDK policy', () => {
    expect(
      resolveIndexingSourceMaintenanceActions(
        buildSource({
          health: {
            ...buildSource().health,
            status: 'permission-required',
            permissionState: 'denied'
          }
        })
      )
    ).toEqual([
      { action: 'scan', enabled: false, reason: 'health:permission-required' },
      { action: 'reconcile', enabled: false, reason: 'health:permission-required' },
      { action: 'reset', enabled: true }
    ])
  })
})
