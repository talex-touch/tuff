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

    now = 1700
    expect(gate.canStart('file-provider', 'reconcile')).toEqual({
      allowed: true,
      reason: 'allowed',
      lastCompletedAt: 1200
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
