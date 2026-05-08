import { describe, expect, it } from 'vitest'
import {
  createClipboardFreshnessState,
  createIneligibleClipboardFreshnessState
} from './clipboard-freshness'

describe('clipboard-freshness', () => {
  it('marks native watcher captures as auto-paste eligible', () => {
    const state = createClipboardFreshnessState({
      source: 'native-watch',
      observedAt: 1000,
      previousScanAt: 500
    })

    expect(state).toEqual({
      eligible: true,
      captureSource: 'native-watch',
      observedAt: 1000,
      freshnessBaseAt: 1000
    })
  })

  it('uses previous successful scan time as conservative poll freshness base', () => {
    const state = createClipboardFreshnessState({
      source: 'background-poll',
      observedAt: 10_000,
      previousScanAt: 2_000
    })

    expect(state.eligible).toBe(true)
    expect(state.freshnessBaseAt).toBe(2_000)
  })

  it('does not grant auto-paste eligibility to CoreBox show baseline scans', () => {
    const state = createClipboardFreshnessState({
      source: 'corebox-show-baseline',
      observedAt: 10_000,
      previousScanAt: 9_000
    })

    expect(state.eligible).toBe(false)
    expect(state.captureSource).toBe('corebox-show-baseline')
  })

  it('creates ineligible state for startup and app-owned writes', () => {
    expect(createIneligibleClipboardFreshnessState('startup-bootstrap', 42)).toEqual({
      eligible: false,
      captureSource: 'startup-bootstrap',
      observedAt: 42,
      freshnessBaseAt: 42
    })
  })
})
