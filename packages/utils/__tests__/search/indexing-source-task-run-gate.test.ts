import { describe, expect, it } from 'vitest'
import { IndexedSourceTaskRunGate } from '../../search'

describe('indexed source task run gate', () => {
  it('allows first run and blocks the same source/kind while running', () => {
    const gate = new IndexedSourceTaskRunGate({ now: () => 1000 })

    expect(gate.canStart('file-provider', 'scan')).toEqual({
      allowed: true,
      reason: 'allowed',
      lastCompletedAt: undefined
    })

    gate.start('file-provider', 'scan')

    expect(gate.isRunning('file-provider', 'scan')).toBe(true)
    expect(gate.canStart('file-provider', 'scan')).toEqual({
      allowed: false,
      reason: 'already-running',
      runningSince: 1000,
      lastCompletedAt: undefined
    })
    expect(gate.canStart('file-provider', 'reconcile').allowed).toBe(true)
    expect(gate.canStart('app-provider', 'scan').allowed).toBe(true)
  })

  it('records completion and applies optional debounce', () => {
    let now = 1000
    const gate = new IndexedSourceTaskRunGate({
      now: () => now,
      debounceMs: 500
    })

    gate.start('file-provider', 'reconcile')
    now = 1200
    gate.complete('file-provider', 'reconcile')

    expect(gate.isRunning('file-provider', 'reconcile')).toBe(false)
    expect(gate.getEntry('file-provider', 'reconcile')).toEqual({
      sourceId: 'file-provider',
      kind: 'reconcile',
      lastCompletedAt: 1200
    })
    expect(gate.canStart('file-provider', 'reconcile')).toEqual({
      allowed: false,
      reason: 'debounced',
      lastCompletedAt: 1200,
      nextAllowedAt: 1700
    })
    expect(gate.getSnapshot(1300)).toEqual({
      generatedAt: 1300,
      totalEntries: 1,
      runningEntries: 0,
      blockedEntries: 1,
      entries: [
        {
          sourceId: 'file-provider',
          kind: 'reconcile',
          blockedCount: 1,
          runningSince: undefined,
          lastCompletedAt: 1200,
          lastBlockedAt: 1200,
          lastBlockedReason: 'debounced',
          nextAllowedAt: 1700
        }
      ]
    })

    now = 1700
    expect(gate.canStart('file-provider', 'reconcile')).toEqual({
      allowed: true,
      reason: 'allowed',
      lastCompletedAt: 1200
    })
  })

  it('keeps the latest completion timestamp when completion events arrive out of order', () => {
    let now = 1000
    const gate = new IndexedSourceTaskRunGate({
      now: () => now,
      debounceMs: 500
    })

    gate.start('file-provider', 'scan')
    now = 2000
    gate.complete('file-provider', 'scan')
    now = 1500
    gate.complete('file-provider', 'scan')

    expect(gate.getEntry('file-provider', 'scan')).toEqual({
      sourceId: 'file-provider',
      kind: 'scan',
      lastCompletedAt: 2000
    })
    expect(gate.canStart('file-provider', 'scan')).toEqual({
      allowed: false,
      reason: 'debounced',
      lastCompletedAt: 2000,
      nextAllowedAt: 2500
    })
  })

  it('normalizes invalid explicit timestamps before they enter gate state', () => {
    let now = 1000
    const gate = new IndexedSourceTaskRunGate({
      now: () => now,
      debounceMs: 500
    })

    gate.start('file-provider', 'scan', Number.NaN)
    expect(gate.getEntry('file-provider', 'scan')).toEqual({
      sourceId: 'file-provider',
      kind: 'scan',
      runningSince: 1000
    })

    now = 1200
    gate.complete('file-provider', 'scan', Number.POSITIVE_INFINITY)

    expect(gate.getEntry('file-provider', 'scan')).toEqual({
      sourceId: 'file-provider',
      kind: 'scan',
      lastCompletedAt: 1200
    })
    expect(gate.canStart('file-provider', 'scan')).toEqual({
      allowed: false,
      reason: 'debounced',
      lastCompletedAt: 1200,
      nextAllowedAt: 1700
    })
  })

  it('clamps future explicit completion timestamps to the current clock', () => {
    let now = 1000
    const gate = new IndexedSourceTaskRunGate({
      now: () => now,
      debounceMs: 500
    })

    gate.start('file-provider', 'scan')
    gate.complete('file-provider', 'scan', 60_000)

    expect(gate.getEntry('file-provider', 'scan')).toEqual({
      sourceId: 'file-provider',
      kind: 'scan',
      lastCompletedAt: 1000
    })
    expect(gate.canStart('file-provider', 'scan')).toEqual({
      allowed: false,
      reason: 'debounced',
      lastCompletedAt: 1000,
      nextAllowedAt: 1500
    })

    now = 1500
    expect(gate.canStart('file-provider', 'scan')).toEqual({
      allowed: true,
      reason: 'allowed',
      lastCompletedAt: 1000
    })
  })

  it('hydrates completion timestamps into debounce state without marking tasks running', () => {
    let now = 1200
    const gate = new IndexedSourceTaskRunGate({
      now: () => now,
      debounceMs: 500
    })

    gate.hydrateCompletion('file-provider', 'scan', 1000)

    expect(gate.isRunning('file-provider', 'scan')).toBe(false)
    expect(gate.getEntry('file-provider', 'scan')).toEqual({
      sourceId: 'file-provider',
      kind: 'scan',
      lastCompletedAt: 1000
    })
    expect(gate.canStart('file-provider', 'scan')).toEqual({
      allowed: false,
      reason: 'debounced',
      lastCompletedAt: 1000,
      nextAllowedAt: 1500
    })

    now = 1500
    expect(gate.canStart('file-provider', 'scan')).toEqual({
      allowed: true,
      reason: 'allowed',
      lastCompletedAt: 1000
    })
  })

  it('keeps the latest hydrated completion timestamp and clamps future values', () => {
    let now = 2000
    const gate = new IndexedSourceTaskRunGate({
      now: () => now,
      debounceMs: 500
    })

    gate.hydrateCompletion('file-provider', 'reconcile', 1800)
    now = 1700
    gate.hydrateCompletion('file-provider', 'reconcile', 1600)

    expect(gate.getEntry('file-provider', 'reconcile')).toEqual({
      sourceId: 'file-provider',
      kind: 'reconcile',
      lastCompletedAt: 1800
    })

    gate.hydrateCompletion('file-provider', 'reconcile', 60_000)

    expect(gate.getEntry('file-provider', 'reconcile')).toEqual({
      sourceId: 'file-provider',
      kind: 'reconcile',
      lastCompletedAt: 1800
    })
  })

  it('drops malformed gate updates when no finite timestamp is available', () => {
    const gate = new IndexedSourceTaskRunGate({
      now: () => Number.NaN,
      debounceMs: 500
    })

    gate.start('file-provider', 'scan', Number.NaN)
    gate.complete('file-provider', 'scan', Number.POSITIVE_INFINITY)
    gate.hydrateCompletion('file-provider', 'scan', Number.NaN)

    expect(gate.isRunning('file-provider', 'scan')).toBe(false)
    expect(gate.getEntry('file-provider', 'scan')).toBeUndefined()
    expect(gate.canStart('file-provider', 'scan')).toEqual({
      allowed: true,
      reason: 'allowed',
      lastCompletedAt: undefined
    })
    expect(gate.getSnapshot(Number.NaN)).toEqual({
      generatedAt: 0,
      totalEntries: 0,
      runningEntries: 0,
      blockedEntries: 0,
      entries: []
    })
  })

  it('tracks already-running blocks in a sorted snapshot', () => {
    let now = 1000
    const gate = new IndexedSourceTaskRunGate({ now: () => now })

    gate.start('z-source', 'scan')
    gate.start('a-source', 'reset')
    now = 1100

    expect(gate.canStart('z-source', 'scan')).toEqual({
      allowed: false,
      reason: 'already-running',
      runningSince: 1000,
      lastCompletedAt: undefined
    })

    expect(gate.getSnapshot()).toEqual({
      generatedAt: 1100,
      totalEntries: 2,
      runningEntries: 2,
      blockedEntries: 1,
      entries: [
        {
          sourceId: 'a-source',
          kind: 'reset',
          blockedCount: 0,
          runningSince: 1000,
          lastCompletedAt: undefined,
          lastBlockedAt: undefined,
          lastBlockedReason: undefined,
          nextAllowedAt: undefined
        },
        {
          sourceId: 'z-source',
          kind: 'scan',
          blockedCount: 1,
          runningSince: 1000,
          lastCompletedAt: undefined,
          lastBlockedAt: 1100,
          lastBlockedReason: 'already-running',
          nextAllowedAt: undefined
        }
      ]
    })
  })

  it('can clear one source or all gate state', () => {
    const gate = new IndexedSourceTaskRunGate({ now: () => 1000 })
    gate.start('file-provider', 'scan')
    gate.start('app-provider', 'scan')

    gate.clear('file-provider')

    expect(gate.isRunning('file-provider', 'scan')).toBe(false)
    expect(gate.isRunning('app-provider', 'scan')).toBe(true)

    gate.clear()

    expect(gate.isRunning('app-provider', 'scan')).toBe(false)
  })
})
