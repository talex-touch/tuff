import { describe, expect, it } from 'vitest'
import {
  buildIndexedSourceReconcileTaskState,
  buildIndexedSourceResetTaskState,
  buildIndexedSourceScanTaskState,
  buildIndexedSourceWatchTaskState,
  updateIndexedSourceTaskState
} from '../../search'
import type { IndexedSourceRuntimeTaskState } from '../../search'

describe('indexing source task state', () => {
  it('updates the selected last task field and prepends history', () => {
    const state: IndexedSourceRuntimeTaskState = {
      recentTasks: [
        {
          kind: 'watch',
          status: 'succeeded',
          completedAt: 2
        }
      ]
    }

    expect(
      updateIndexedSourceTaskState({
        state,
        key: 'lastScan',
        value: {
          startedAt: 1,
          completedAt: 3,
          batches: 2,
          records: 5
        },
        historyEntry: {
          kind: 'scan',
          status: 'succeeded',
          startedAt: 1,
          completedAt: 3,
          summary: {
            batches: 2,
            records: 5
          }
        }
      })
    ).toEqual({
      lastScan: {
        startedAt: 1,
        completedAt: 3,
        batches: 2,
        records: 5
      },
      recentTasks: [
        {
          kind: 'scan',
          status: 'succeeded',
          startedAt: 1,
          completedAt: 3,
          summary: {
            batches: 2,
            records: 5
          }
        },
        {
          kind: 'watch',
          status: 'succeeded',
          completedAt: 2
        }
      ]
    })
  })

  it('keeps bounded recent task history', () => {
    const state: IndexedSourceRuntimeTaskState = {
      recentTasks: [
        { kind: 'scan', status: 'succeeded', completedAt: 3 },
        { kind: 'scan', status: 'succeeded', completedAt: 2 }
      ]
    }

    const next = updateIndexedSourceTaskState({
      state,
      key: 'lastReset',
      value: {
        startedAt: 4,
        completedAt: 5,
        reason: 'manual-rebuild',
        clearedSearchIndex: true,
        clearedScanProgress: true
      },
      historyEntry: {
        kind: 'reset',
        status: 'succeeded',
        completedAt: 5
      },
      historyLimit: 2
    })

    expect(next.recentTasks).toEqual([
      { kind: 'reset', status: 'succeeded', completedAt: 5 },
      { kind: 'scan', status: 'succeeded', completedAt: 3 }
    ])
  })

  it('does not mutate existing state', () => {
    const state: IndexedSourceRuntimeTaskState = {}

    const next = updateIndexedSourceTaskState({
      state,
      key: 'lastWatch',
      value: {
        occurredAt: 1,
        completedAt: 2,
        action: 'change',
        path: '/tmp/a',
        deltas: 1,
        appliedDeltas: 1,
        failedDeltas: 0
      },
      historyEntry: {
        kind: 'watch',
        status: 'succeeded',
        completedAt: 2
      }
    })

    expect(state).toEqual({})
    expect(next).not.toBe(state)
  })

  it('builds scan task state with job identity and summary', () => {
    expect(
      buildIndexedSourceScanTaskState({
        sourceId: 'file-provider',
        startedAt: 10,
        completedAt: 20,
        batches: 2,
        records: 5,
        job: {
          id: 'file-provider:scan:1',
          sourceId: 'file-provider',
          kind: 'scan',
          queuedAt: 9
        }
      })
    ).toEqual({
      sourceId: 'file-provider',
      key: 'lastScan',
      value: {
        startedAt: 10,
        completedAt: 20,
        jobId: 'file-provider:scan:1',
        queuedAt: 9,
        batches: 2,
        records: 5,
        error: undefined
      },
      historyEntry: {
        kind: 'scan',
        status: 'succeeded',
        startedAt: 10,
        completedAt: 20,
        jobId: 'file-provider:scan:1',
        queuedAt: 9,
        error: undefined,
        summary: {
          batches: 2,
          records: 5
        }
      }
    })
  })

  it('builds skipped scan task state with normalized skip error', () => {
    expect(
      buildIndexedSourceScanTaskState({
        sourceId: 'browser-bookmarks',
        startedAt: 10,
        completedAt: 10,
        status: 'skipped',
        skipReason: 'health:disabled'
      })
    ).toEqual({
      sourceId: 'browser-bookmarks',
      key: 'lastScan',
      value: {
        startedAt: 10,
        completedAt: 10,
        jobId: undefined,
        queuedAt: undefined,
        batches: 0,
        records: 0,
        error: 'skipped:health:disabled'
      },
      historyEntry: {
        kind: 'scan',
        status: 'skipped',
        startedAt: 10,
        completedAt: 10,
        jobId: undefined,
        queuedAt: undefined,
        error: 'skipped:health:disabled',
        summary: undefined
      }
    })
  })

  it('builds watch task state with job identity and summary', () => {
    expect(
      buildIndexedSourceWatchTaskState({
        sourceId: 'file-provider',
        occurredAt: 10,
        completedAt: 20,
        action: 'change',
        path: '/tmp/report.md',
        deltas: 2,
        appliedDeltas: 2,
        failedDeltas: 0,
        job: {
          id: 'file-provider:watch:1',
          sourceId: 'file-provider',
          kind: 'watch',
          queuedAt: 9
        }
      })
    ).toEqual({
      sourceId: 'file-provider',
      key: 'lastWatch',
      value: {
        occurredAt: 10,
        completedAt: 20,
        jobId: 'file-provider:watch:1',
        queuedAt: 9,
        action: 'change',
        path: '/tmp/report.md',
        deltas: 2,
        appliedDeltas: 2,
        failedDeltas: 0,
        error: undefined
      },
      historyEntry: {
        kind: 'watch',
        status: 'succeeded',
        occurredAt: 10,
        completedAt: 20,
        jobId: 'file-provider:watch:1',
        queuedAt: 9,
        error: undefined,
        summary: {
          action: 'change',
          deltas: 2,
          appliedDeltas: 2,
          failedDeltas: 0
        }
      }
    })
  })

  it('builds skipped watch task state with normalized skip error', () => {
    expect(
      buildIndexedSourceWatchTaskState({
        sourceId: 'browser-bookmarks',
        occurredAt: 10,
        completedAt: 20,
        action: 'change',
        path: '/browser/Default/Bookmarks',
        status: 'skipped',
        skipReason: 'health:disabled',
        summary: {
          action: 'change'
        }
      })
    ).toEqual({
      sourceId: 'browser-bookmarks',
      key: 'lastWatch',
      value: {
        occurredAt: 10,
        completedAt: 20,
        jobId: undefined,
        queuedAt: undefined,
        action: 'change',
        path: '/browser/Default/Bookmarks',
        deltas: 0,
        appliedDeltas: 0,
        failedDeltas: 0,
        error: 'skipped:health:disabled'
      },
      historyEntry: {
        kind: 'watch',
        status: 'skipped',
        occurredAt: 10,
        completedAt: 20,
        jobId: undefined,
        queuedAt: undefined,
        error: 'skipped:health:disabled',
        summary: {
          action: 'change'
        }
      }
    })
  })

  it('builds reconcile task state with job identity and summary', () => {
    expect(
      buildIndexedSourceReconcileTaskState({
        sourceId: 'file-provider',
        startedAt: 10,
        completedAt: 20,
        added: 1,
        changed: 2,
        deleted: 3,
        skipped: 4,
        errors: 0,
        reason: 'manual-repair',
        rootCount: 2,
        deltas: 6,
        appliedDeltas: 6,
        failedDeltas: 0,
        job: {
          id: 'file-provider:reconcile:1',
          sourceId: 'file-provider',
          kind: 'reconcile',
          queuedAt: 9
        },
        summary: {
          added: 1,
          changed: 2,
          deleted: 3,
          skipped: 4,
          errors: 0,
          reason: 'manual-repair',
          rootCount: 2
        }
      })
    ).toEqual({
      sourceId: 'file-provider',
      key: 'lastReconcile',
      value: {
        startedAt: 10,
        completedAt: 20,
        added: 1,
        changed: 2,
        deleted: 3,
        skipped: 4,
        errors: 0,
        reason: 'manual-repair',
        rootCount: 2,
        jobId: 'file-provider:reconcile:1',
        queuedAt: 9,
        deltas: 6,
        appliedDeltas: 6,
        failedDeltas: 0,
        error: undefined
      },
      historyEntry: {
        kind: 'reconcile',
        status: 'succeeded',
        startedAt: 10,
        completedAt: 20,
        jobId: 'file-provider:reconcile:1',
        queuedAt: 9,
        error: undefined,
        summary: {
          added: 1,
          changed: 2,
          deleted: 3,
          skipped: 4,
          errors: 0,
          reason: 'manual-repair',
          rootCount: 2
        }
      }
    })
  })

  it('builds skipped reconcile task state with normalized skip error', () => {
    expect(
      buildIndexedSourceReconcileTaskState({
        sourceId: 'browser-bookmarks',
        startedAt: 10,
        completedAt: 20,
        status: 'skipped',
        skipReason: 'health:permission-required',
        skipped: 1
      })
    ).toEqual({
      sourceId: 'browser-bookmarks',
      key: 'lastReconcile',
      value: {
        startedAt: 10,
        completedAt: 20,
        added: 0,
        changed: 0,
        deleted: 0,
        skipped: 1,
        errors: 0,
        reason: undefined,
        rootCount: undefined,
        jobId: undefined,
        queuedAt: undefined,
        deltas: undefined,
        appliedDeltas: undefined,
        failedDeltas: undefined,
        error: 'skipped:health:permission-required'
      },
      historyEntry: {
        kind: 'reconcile',
        status: 'skipped',
        startedAt: 10,
        completedAt: 20,
        jobId: undefined,
        queuedAt: undefined,
        error: 'skipped:health:permission-required',
        summary: undefined
      }
    })
  })

  it('builds reset task state with job identity and summary', () => {
    expect(
      buildIndexedSourceResetTaskState({
        sourceId: 'file-provider',
        startedAt: 10,
        completedAt: 20,
        reason: 'manual-rebuild',
        clearedSearchIndex: true,
        clearedScanProgress: true,
        scanProgressRows: 3,
        job: {
          id: 'file-provider:reset:1',
          sourceId: 'file-provider',
          kind: 'reset',
          queuedAt: 9
        }
      })
    ).toEqual({
      sourceId: 'file-provider',
      key: 'lastReset',
      value: {
        startedAt: 10,
        completedAt: 20,
        reason: 'manual-rebuild',
        jobId: 'file-provider:reset:1',
        queuedAt: 9,
        clearedSearchIndex: true,
        clearedScanProgress: true,
        scanProgressRows: 3,
        error: undefined
      },
      historyEntry: {
        kind: 'reset',
        status: 'succeeded',
        startedAt: 10,
        completedAt: 20,
        jobId: 'file-provider:reset:1',
        queuedAt: 9,
        error: undefined,
        summary: {
          reason: 'manual-rebuild',
          clearedSearchIndex: true,
          clearedScanProgress: true,
          scanProgressRows: 3
        }
      }
    })
  })

  it('builds failed reset task state with error', () => {
    expect(
      buildIndexedSourceResetTaskState({
        sourceId: 'file-provider',
        startedAt: 10,
        completedAt: 20,
        reason: 'integrity-repair',
        clearedSearchIndex: false,
        clearedScanProgress: false,
        error: 'reset failed'
      })
    ).toEqual({
      sourceId: 'file-provider',
      key: 'lastReset',
      value: {
        startedAt: 10,
        completedAt: 20,
        reason: 'integrity-repair',
        jobId: undefined,
        queuedAt: undefined,
        clearedSearchIndex: false,
        clearedScanProgress: false,
        scanProgressRows: undefined,
        error: 'reset failed'
      },
      historyEntry: {
        kind: 'reset',
        status: 'failed',
        startedAt: 10,
        completedAt: 20,
        jobId: undefined,
        queuedAt: undefined,
        error: 'reset failed',
        summary: {
          reason: 'integrity-repair',
          clearedSearchIndex: false,
          clearedScanProgress: false,
          scanProgressRows: undefined
        }
      }
    })
  })
})
