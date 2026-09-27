import type { UpdateLifecyclePhase, UpdateLifecycleSnapshot } from '@talex-touch/utils'
import { AppPreviewChannel } from '@talex-touch/utils'
import { describe, expect, it } from 'vitest'
import { buildUpdateHistory } from './update-history'

function attempt(
  attemptId: string,
  phase: UpdateLifecyclePhase,
  targetVersion: string | null,
  updatedAt: number,
  overrides: Partial<UpdateLifecycleSnapshot> = {}
): UpdateLifecycleSnapshot {
  return {
    attemptId,
    revision: 4,
    phase,
    currentVersion: '2.4.13',
    targetVersion,
    source: 'nexus',
    channel: AppPreviewChannel.RELEASE,
    releaseTag: targetVersion,
    taskId: targetVersion ? `task-${attemptId}` : null,
    installMode: null,
    installOnNormalQuit: true,
    rollbackCompatible: false,
    rollbackFromVersion: null,
    previousVersion: null,
    recoveryAvailable: false,
    lastCheckAt: null,
    error:
      phase === 'failed'
        ? { code: 'UPDATE_DOWNLOAD_FAILED', message: `${attemptId} failed`, retryable: true }
        : null,
    createdAt: updatedAt - 10,
    updatedAt,
    ...overrides
  }
}

function manyUpdated(count: number): UpdateLifecycleSnapshot[] {
  return Array.from({ length: count }, (_, index) =>
    attempt(`updated-${index}`, 'healthy', `v2.5.${index}`, 1_000 + index)
  )
}

describe('buildUpdateHistory', () => {
  it('maps each finished phase to its outcome and carries the attempt details', () => {
    const verificationError = {
      code: 'UPDATE_VERIFICATION_FAILED',
      message: 'signature mismatch',
      retryable: false
    }
    const history = buildUpdateHistory([
      attempt('updated', 'healthy', 'v2.4.14', 300, { channel: AppPreviewChannel.BETA }),
      attempt('rolled-back', 'recovered', 'v2.4.15', 400, { currentVersion: '2.4.14' }),
      attempt('failed', 'failed', 'v2.4.16', 500, {
        currentVersion: '2.4.14',
        error: verificationError
      })
    ])

    expect(history).toEqual([
      {
        attemptId: 'failed',
        fromVersion: '2.4.14',
        toVersion: 'v2.4.16',
        channel: AppPreviewChannel.RELEASE,
        outcome: 'failed',
        finishedAt: 500,
        error: verificationError
      },
      {
        attemptId: 'rolled-back',
        fromVersion: '2.4.14',
        toVersion: 'v2.4.15',
        channel: AppPreviewChannel.RELEASE,
        outcome: 'rolled-back',
        finishedAt: 400,
        error: null
      },
      {
        attemptId: 'updated',
        fromVersion: '2.4.13',
        toVersion: 'v2.4.14',
        channel: AppPreviewChannel.BETA,
        outcome: 'updated',
        finishedAt: 300,
        error: null
      }
    ])
  })

  it('leaves out checks, in-flight attempts and attempts that never named a target version', () => {
    const history = buildUpdateHistory([
      attempt('no-update', 'idle', null, 100),
      attempt('check-failed', 'failed', null, 200),
      attempt('downloading', 'downloading', 'v2.5.0', 300),
      attempt('ready', 'ready', 'v2.5.1', 400),
      attempt('recovering', 'recovering', 'v2.5.2', 500),
      attempt('no-id', 'healthy', 'v2.5.3', 600, { attemptId: null }),
      attempt('updated', 'healthy', 'v2.4.14', 50)
    ])

    expect(history.map((entry) => entry.attemptId)).toEqual(['updated'])
  })

  it('collapses repeated failures of one version into its newest attempt', () => {
    const history = buildUpdateHistory([
      attempt('fail-1', 'failed', 'v2.5.0', 100),
      attempt('fail-3', 'failed', 'v2.5.0', 300),
      attempt('fail-2', 'failed', 'v2.5.0', 200)
    ])

    expect(history).toEqual([
      expect.objectContaining({
        attemptId: 'fail-3',
        toVersion: 'v2.5.0',
        outcome: 'failed',
        finishedAt: 300,
        error: expect.objectContaining({ message: 'fail-3 failed' })
      })
    ])
  })

  it('shows a version as updated once a retry succeeded after it failed', () => {
    const history = buildUpdateHistory([
      attempt('fail', 'failed', 'v2.5.0', 100),
      attempt('rolled-back', 'recovered', 'v2.5.0', 200),
      attempt('updated', 'healthy', 'v2.5.0', 300)
    ])

    expect(history).toEqual([
      expect.objectContaining({ attemptId: 'updated', outcome: 'updated', error: null })
    ])
  })

  it('orders rows newest first whatever order the attempts arrive in', () => {
    const history = buildUpdateHistory([
      attempt('oldest', 'healthy', 'v2.4.14', 100),
      attempt('tie-started-early', 'healthy', 'v2.4.15', 200, { createdAt: 150 }),
      attempt('newest', 'failed', 'v2.4.17', 300),
      attempt('tie-started-late', 'healthy', 'v2.4.16', 200, { createdAt: 180 })
    ])

    expect(history.map((entry) => entry.attemptId)).toEqual([
      'newest',
      'tie-started-late',
      'tie-started-early',
      'oldest'
    ])
  })

  it('applies the limit after collapsing versions', () => {
    const history = buildUpdateHistory(
      [
        attempt('fail-1', 'failed', 'v2.5.2', 400),
        attempt('fail-2', 'failed', 'v2.5.2', 500),
        attempt('fail-3', 'failed', 'v2.5.2', 600),
        attempt('updated-1', 'healthy', 'v2.5.1', 300),
        attempt('updated-0', 'healthy', 'v2.5.0', 200)
      ],
      2
    )

    expect(history.map((entry) => [entry.attemptId, entry.toVersion])).toEqual([
      ['fail-3', 'v2.5.2'],
      ['updated-1', 'v2.5.1']
    ])
  })

  it.each([
    { name: 'no limit', limit: undefined, rows: 20 },
    { name: 'a limit inside the range', limit: 5, rows: 5 },
    { name: 'zero', limit: 0, rows: 1 },
    { name: 'a negative limit', limit: -3, rows: 1 },
    { name: 'a fractional limit', limit: 2.9, rows: 2 },
    { name: 'a limit above the maximum', limit: 100, rows: 50 },
    { name: 'infinity', limit: Number.POSITIVE_INFINITY, rows: 50 },
    { name: 'NaN', limit: Number.NaN, rows: 20 },
    { name: 'a string sent over IPC', limit: '5' as unknown as number, rows: 20 }
  ])('$name keeps $rows rows', ({ limit, rows }) => {
    const history = buildUpdateHistory(manyUpdated(60), limit)

    expect(history).toHaveLength(rows)
    expect(history[0]?.toVersion).toBe('v2.5.59')
  })

  it('returns an empty history when nothing has finished', () => {
    expect(buildUpdateHistory([])).toEqual([])
    expect(buildUpdateHistory([], 5)).toEqual([])
  })
})
