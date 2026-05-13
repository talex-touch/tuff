import { describe, expect, it } from 'vitest'
import { ClipboardFreshnessStore } from './clipboard-capture-freshness'
import { createClipboardFreshnessState } from './clipboard-freshness'

describe('clipboard-capture-freshness', () => {
  it('stores and resolves capture freshness by clipboard id', () => {
    const store = new ClipboardFreshnessStore()
    const freshness = createClipboardFreshnessState({
      source: 'native-watch',
      observedAt: 100,
      previousScanAt: 50
    })

    store.remember({ id: 1 }, freshness)

    expect(store.resolve({ id: 1 })).toBe(freshness)
  })

  it('falls back to startup bootstrap freshness when no state exists', () => {
    const store = new ClipboardFreshnessStore()

    expect(store.resolve({ id: 404 })).toEqual({
      eligible: false,
      captureSource: 'startup-bootstrap',
      observedAt: expect.any(Number),
      freshnessBaseAt: expect.any(Number)
    })
  })

  it('can delete and clear stored freshness states', () => {
    const store = new ClipboardFreshnessStore()
    const freshness = createClipboardFreshnessState({
      source: 'visible-poll',
      observedAt: 200,
      previousScanAt: 150
    })

    store.remember({ id: 1 }, freshness)
    store.delete(1)
    expect(store.resolve({ id: 1 }).eligible).toBe(false)

    store.remember({ id: 2 }, freshness)
    store.clear()
    expect(store.resolve({ id: 2 }).eligible).toBe(false)
  })
})
