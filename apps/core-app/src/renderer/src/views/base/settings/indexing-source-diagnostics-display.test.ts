import type { IndexedSourceDiagnostics } from '@talex-touch/utils/search'
import { describe, expect, it } from 'vitest'
import {
  countIndexingSourcesNeedingAttention,
  formatIndexingSourceTimestamp,
  resolveIndexingSourceDetailKey,
  resolveIndexingSourceReconcileStateKey,
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
        clear: true,
        open: true
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
        buildSource({ health: { ...buildSource().health, status: 'error' } })
      ])
    ).toBe(2)
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
          batches: 2,
          records: 20
        },
        lastWatch: {
          occurredAt: 1700000000200,
          completedAt: 1700000000300,
          action: 'change',
          path: '/tmp/a.txt',
          deltas: 1,
          appliedDeltas: 1,
          failedDeltas: 0
        },
        lastReconcile: {
          startedAt: 1700000000400,
          completedAt: 1700000000500,
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
})
