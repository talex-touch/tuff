import { describe, expect, it } from 'vitest'
import { updateIndexedSourceTaskState } from '../../search'
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
})
