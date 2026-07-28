import { beforeEach, describe, expect, it } from 'vitest'
// Imported through the same specifier the app uses, so this also proves the app
// and TxCommandPalette share a single z-index manager instance.
import { getZIndex, nextZIndex, resetZIndex } from '@talex-touch/tuffex/utils'
import { NEXUS_OVERLAY_LAYER_SEED, currentOverlayLayer, reserveOverlayLayer } from './layers'

// Hardcoded in TheHeader.vue; the search overlay has to clear both.
const HEADER_Z_INDEX = 10000
const MOBILE_DRAWER_Z_INDEX = 10050

describe('nexus overlay layers', () => {
  beforeEach(() => {
    resetZIndex(2000, 'test')
  })

  it('shares one manager instance with the rest of the app', () => {
    resetZIndex(4242, 'instance probe')
    expect(currentOverlayLayer()).toBe(4242)
    expect(currentOverlayLayer()).toBe(getZIndex())
  })

  it('allocates the search overlay above the header and mobile drawer', () => {
    // Mirrors the real call order: useGlobalSearchState reserves before flipping
    // `open`, TxCommandPalette allocates before emitting `open`, and GlobalSearch
    // reads the number back inside that handler.
    reserveOverlayLayer('nexus-global-search')
    const overlayLayer = nextZIndex()
    const readBack = currentOverlayLayer()

    expect(overlayLayer).toBeGreaterThan(HEADER_Z_INDEX)
    expect(overlayLayer).toBeGreaterThan(MOBILE_DRAWER_Z_INDEX)
    expect(overlayLayer).toBe(NEXUS_OVERLAY_LAYER_SEED + 1)
    // The panel rides the same number as its backdrop.
    expect(readBack).toBe(overlayLayer)
  })

  it('keeps climbing across repeated opens', () => {
    reserveOverlayLayer('first open')
    const first = nextZIndex()
    reserveOverlayLayer('second open')
    const second = nextZIndex()

    expect(second).toBeGreaterThan(first)
    expect(currentOverlayLayer()).toBe(second)
  })

  it('never pulls a taller pre-existing surface back down', () => {
    resetZIndex(20000, 'a taller overlay is already open')
    reserveOverlayLayer('nexus-global-search')

    expect(nextZIndex()).toBeGreaterThan(20000)
  })
})
