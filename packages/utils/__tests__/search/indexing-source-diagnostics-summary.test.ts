import type { IndexedSourceHealth } from '../../search'
import { describe, expect, it } from 'vitest'
import {
  buildIndexedSourceDiagnosticsSummary,
  summarizeIndexedSourceHealth
} from '../../search'

const baseHealth: IndexedSourceHealth = {
  status: 'ready',
  permissionState: 'granted',
  itemCount: 1,
  watchState: 'active',
  reconcileState: 'idle'
}

describe('indexed source diagnostics summary', () => {
  it('summarizes health by status', () => {
    expect(
      summarizeIndexedSourceHealth([
        baseHealth,
        { ...baseHealth, status: 'degraded' },
        { ...baseHealth, status: 'permission-required' },
        { ...baseHealth, status: 'error' },
        { ...baseHealth, status: 'warming' }
      ])
    ).toEqual({
      total: 5,
      byStatus: {
        ready: 1,
        degraded: 1,
        'permission-required': 1,
        error: 1,
        warming: 1
      },
      ready: 1,
      degraded: 1,
      unavailable: 2
    })
  })

  it('summarizes source diagnostics from health fields', () => {
    expect(
      buildIndexedSourceDiagnosticsSummary([
        { health: baseHealth },
        { health: { ...baseHealth, status: 'disabled' } },
        { health: { ...baseHealth, status: 'unsupported' } }
      ])
    ).toEqual({
      total: 3,
      byStatus: {
        ready: 1,
        disabled: 1,
        unsupported: 1
      },
      ready: 1,
      degraded: 0,
      unavailable: 2
    })
  })

  it('returns an empty summary', () => {
    expect(summarizeIndexedSourceHealth([])).toEqual({
      total: 0,
      byStatus: {},
      ready: 0,
      degraded: 0,
      unavailable: 0
    })
  })
})
