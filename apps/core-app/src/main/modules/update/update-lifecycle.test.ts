import type { UpdateLifecyclePhase, UpdateLifecycleSnapshot } from '@talex-touch/utils'
import type { UpdateLifecyclePatch } from './update-lifecycle'
import { AppPreviewChannel } from '@talex-touch/utils'
import { describe, expect, it } from 'vitest'
import { reduceUpdateLifecycle, UpdateLifecycleConflictError } from './update-lifecycle'

function snapshot(phase: UpdateLifecyclePhase, revision = 0): UpdateLifecycleSnapshot {
  return {
    attemptId: 'attempt-1',
    revision,
    phase,
    currentVersion: '2.4.9',
    targetVersion: null,
    source: null,
    channel: AppPreviewChannel.RELEASE,
    releaseTag: null,
    taskId: null,
    installMode: null,
    installOnNormalQuit: false,
    previousVersion: null,
    recoveryAvailable: false,
    rollbackCompatible: false,
    rollbackFromVersion: null,
    lastCheckAt: null,
    error: null,
    createdAt: 100,
    updatedAt: 100
  }
}

function transition(
  current: UpdateLifecycleSnapshot,
  to: UpdateLifecyclePhase,
  patch?: UpdateLifecyclePatch,
  now = current.updatedAt + 1
): UpdateLifecycleSnapshot {
  return reduceUpdateLifecycle(current, {
    attemptId: current.attemptId!,
    expectedRevision: current.revision,
    to,
    patch,
    now
  })
}

describe('reduceUpdateLifecycle', () => {
  it('advances one attempt through the complete install-and-health happy path', () => {
    let current = snapshot('checking')
    const steps: Array<{ to: UpdateLifecyclePhase; patch?: UpdateLifecyclePatch }> = [
      {
        to: 'available',
        patch: {
          targetVersion: '2.5.0',
          source: 'nexus',
          releaseTag: 'v2.5.0'
        }
      },
      { to: 'downloading', patch: { taskId: 'download-1' } },
      { to: 'verifying' },
      { to: 'ready' },
      { to: 'install-scheduled', patch: { installMode: 'normal-quit' } },
      { to: 'handoff-started' },
      { to: 'awaiting-health', patch: { previousVersion: '2.4.9', recoveryAvailable: true } },
      { to: 'healthy' }
    ]

    for (const [index, step] of steps.entries()) {
      current = transition(current, step.to, step.patch, 101 + index)
      expect(current).toMatchObject({
        attemptId: 'attempt-1',
        phase: step.to,
        revision: index + 1,
        updatedAt: 101 + index
      })
    }

    expect(current).toMatchObject({
      targetVersion: '2.5.0',
      source: 'nexus',
      releaseTag: 'v2.5.0',
      taskId: 'download-1',
      installMode: 'normal-quit',
      previousVersion: '2.4.9',
      recoveryAvailable: true,
      error: null
    })
  })

  it('returns a cancelled download to available without losing its release identity', () => {
    const downloading = transition(
      transition(snapshot('checking'), 'available', {
        targetVersion: '2.5.0',
        source: 'github',
        releaseTag: 'v2.5.0'
      }),
      'downloading',
      { taskId: 'download-1' }
    )

    const available = transition(downloading, 'available', { taskId: null }, 200)

    expect(available).toMatchObject({
      phase: 'available',
      revision: 3,
      targetVersion: '2.5.0',
      source: 'github',
      releaseTag: 'v2.5.0',
      taskId: null,
      updatedAt: 200
    })
  })

  it.each([
    ['checking can complete with no candidate', 'checking', 'idle'],
    ['checking can publish a candidate', 'checking', 'available'],
    ['available can begin downloading', 'available', 'downloading'],
    ['downloading can start verification', 'downloading', 'verifying'],
    ['verifying can become ready', 'verifying', 'ready'],
    ['ready can schedule installation', 'ready', 'install-scheduled'],
    ['scheduled installation can start handoff', 'install-scheduled', 'handoff-started'],
    ['handoff can await health', 'handoff-started', 'awaiting-health'],
    ['handoff can require recovery', 'handoff-started', 'recovery-required'],
    ['health monitoring can require recovery', 'awaiting-health', 'recovery-required'],
    ['health monitoring can complete', 'awaiting-health', 'healthy'],
    ['recovery can start', 'recovery-required', 'recovering'],
    ['recovery can complete', 'recovering', 'recovered']
  ] as const)('%s', (_name, from, to) => {
    const next = transition(snapshot(from), to)

    expect(next).toMatchObject({ phase: to, revision: 1, error: null })
  })

  it.each([
    ['checking', 'failed'],
    ['available', 'failed'],
    ['downloading', 'failed'],
    ['verifying', 'failed'],
    ['ready', 'failed'],
    ['install-scheduled', 'failed'],
    ['handoff-started', 'failed'],
    ['awaiting-health', 'failed'],
    ['recovery-required', 'failed'],
    ['recovering', 'failed']
  ] as const)('%s records stable failures', (from, to) => {
    const error = { code: 'DOWNLOAD_FAILED', message: 'network failed', retryable: true }

    const next = transition(snapshot(from), to, { error })

    expect(next).toMatchObject({ phase: 'failed', revision: 1, error })
  })

  it('rejects invalid edges and failures without a stable error', () => {
    expect(() => transition(snapshot('ready'), 'awaiting-health')).toThrow(
      UpdateLifecycleConflictError
    )
    expect(() => transition(snapshot('checking'), 'failed')).toThrow(
      'Failed update lifecycle requires a stable error'
    )
  })

  it('rejects stale revisions and transitions from another attempt', () => {
    const current = snapshot('available', 4)

    expect(() =>
      reduceUpdateLifecycle(current, {
        attemptId: 'attempt-1',
        expectedRevision: 3,
        to: 'downloading'
      })
    ).toThrow('Update lifecycle revision is stale')
    expect(() =>
      reduceUpdateLifecycle(current, {
        attemptId: 'attempt-2',
        expectedRevision: 4,
        to: 'downloading'
      })
    ).toThrow('Update attempt does not match the active lifecycle')
  })

  it.each(['healthy', 'recovered', 'failed'] as const)(
    'rejects duplicate transitions from terminal %s',
    (phase) => {
      expect(() => transition(snapshot(phase), phase)).toThrow(
        `Invalid update lifecycle transition: ${phase} -> ${phase}`
      )
    }
  )
})
