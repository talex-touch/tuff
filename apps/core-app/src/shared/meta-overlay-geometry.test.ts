import { describe, expect, it } from 'vitest'
import {
  estimateMetaPanelHeight,
  extendMetaPanelHeightForPluginRows,
  META_FLOW_CONFIRM_PANEL_HEIGHT,
  META_PANEL_MAX_HEIGHT,
  resolveMetaOverlayWindowHeight,
  resolveMetaPanelBottomInset,
  resolveMetaPanelCssVars
} from './meta-overlay-geometry'

describe('resolveMetaPanelBottomInset', () => {
  it('sits the panel above the 44px footer, or in the corner without one', () => {
    expect(resolveMetaPanelBottomInset('footer')).toBe(52)
    expect(resolveMetaPanelBottomInset('corner')).toBe(12)
    expect(resolveMetaPanelBottomInset(undefined)).toBe(12)
  })
})

describe('resolveMetaPanelCssVars', () => {
  it('hands the panel CSS the numbers main sizes the window with', () => {
    expect(resolveMetaPanelCssVars('footer')).toEqual({
      '--meta-panel-width': '340px',
      '--meta-panel-max-height': '420px',
      '--meta-panel-right': '12px',
      '--meta-panel-top': '64px',
      '--meta-panel-bottom': '52px',
      '--meta-header-height': '40px',
      '--meta-filter-height': '40px',
      '--meta-list-padding': '6px',
      '--meta-row-height': '32px',
      '--meta-section-title-height': '24px',
      '--meta-section-gap': '4px'
    })
  })

  it('moves only the bottom inset with the anchor', () => {
    const footer = resolveMetaPanelCssVars('footer')
    expect(resolveMetaPanelCssVars('corner')).toEqual({ ...footer, '--meta-panel-bottom': '12px' })
    expect(resolveMetaPanelCssVars(undefined)).toEqual({ ...footer, '--meta-panel-bottom': '12px' })
  })
})

describe('resolveMetaOverlayWindowHeight', () => {
  it('adds the search header and the anchor inset to the panel height', () => {
    expect(resolveMetaOverlayWindowHeight({ anchor: 'footer', desiredPanelHeight: 300 })).toBe(416)
    expect(resolveMetaOverlayWindowHeight({ anchor: 'corner', desiredPanelHeight: 300 })).toBe(376)
  })

  it('caps the panel at its maximum before sizing the window', () => {
    expect(resolveMetaOverlayWindowHeight({ anchor: 'footer', desiredPanelHeight: 10_000 })).toBe(
      64 + META_PANEL_MAX_HEIGHT + 52
    )
  })

  it('rounds a fractional height up, so the panel is never a pixel short', () => {
    expect(resolveMetaOverlayWindowHeight({ anchor: 'corner', desiredPanelHeight: 300.2 })).toBe(
      377
    )
  })

  it.each([undefined, 0, -10, Number.NaN, Number.POSITIVE_INFINITY])(
    'leaves the window alone for an unusable height (%s)',
    (desiredPanelHeight) => {
      expect(resolveMetaOverlayWindowHeight({ anchor: 'footer', desiredPanelHeight })).toBeNull()
    }
  )
})

describe('estimateMetaPanelHeight', () => {
  it('sums the item header, the list and the filter row', () => {
    // 40 + (6 + 3 × 32 + 1 × 24 + 1 × 4 + 6) + 40
    expect(estimateMetaPanelHeight({ rows: 3, sections: 2, titledSections: 1 })).toBe(216)
  })

  it('keeps room for the empty state, and stops at the maximum', () => {
    expect(estimateMetaPanelHeight({ rows: 0, sections: 0, titledSections: 0 })).toBe(124)
    expect(estimateMetaPanelHeight({ rows: 40, sections: 6, titledSections: 5 })).toBe(
      META_PANEL_MAX_HEIGHT
    )
  })
})

describe('extendMetaPanelHeightForPluginRows', () => {
  it('adds a titled plugin section after the renderer’s own rows', () => {
    expect(extendMetaPanelHeightForPluginRows(200, 2)).toBe(200 + 4 + 24 + 64)
    expect(extendMetaPanelHeightForPluginRows(200, 0)).toBe(200)
    expect(extendMetaPanelHeightForPluginRows(400, 5)).toBe(META_PANEL_MAX_HEIGHT)
  })
})

describe('META_FLOW_CONFIRM_PANEL_HEIGHT', () => {
  it('fits the confirmation with its buttons wrapped onto two rows, as English lays them out', () => {
    // 40 + 12 + 20 + 4 + 72 + 12 + (26 + 8 + 26) + 12, the card measured in the real window.
    expect(META_FLOW_CONFIRM_PANEL_HEIGHT).toBe(232)
  })
})
