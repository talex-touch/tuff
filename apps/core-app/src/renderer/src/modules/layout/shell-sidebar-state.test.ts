import { describe, expect, it } from 'vitest'
import {
  clampExpandedWidth,
  resolveDragState,
  resolveRenderedWidth,
  SIDEBAR_BRAND_LABEL_MIN,
  SIDEBAR_COLLAPSE_THRESHOLD,
  SIDEBAR_EXPAND_THRESHOLD,
  SIDEBAR_EXPANDED_DEFAULT,
  SIDEBAR_EXPANDED_MAX,
  SIDEBAR_EXPANDED_MIN,
  SIDEBAR_HISTORY_MIN,
  SIDEBAR_RAIL_WIDTH,
  SIDEBAR_RAIL_WIDTH_MAC
} from './shell-sidebar-state'

describe('threshold ordering', () => {
  it('leaves a dead band between collapsing and re-expanding', () => {
    // Without this the sidebar collapses at a width the expand rule immediately undoes, and a
    // stationary pointer flips it open and shut every frame.
    expect(SIDEBAR_EXPAND_THRESHOLD).toBeGreaterThan(SIDEBAR_COLLAPSE_THRESHOLD)
  })

  it('keeps both shedding stages reachable inside the expanded range', () => {
    // Each stage has to fire before the one below it, and the narrowest has to sit above the
    // minimum width — otherwise dragging narrower does nothing until the sidebar snaps to rail.
    expect(SIDEBAR_BRAND_LABEL_MIN).toBeGreaterThan(SIDEBAR_HISTORY_MIN)
    expect(SIDEBAR_HISTORY_MIN).toBeGreaterThan(SIDEBAR_EXPANDED_MIN)
    expect(SIDEBAR_BRAND_LABEL_MIN).toBeLessThan(SIDEBAR_EXPANDED_MAX)
  })

  it('starts at a width where nothing is shed', () => {
    expect(SIDEBAR_EXPANDED_DEFAULT).toBeGreaterThanOrEqual(SIDEBAR_BRAND_LABEL_MIN)
  })
})

describe('clampExpandedWidth', () => {
  it('keeps widths inside the expanded range', () => {
    expect(clampExpandedWidth(260)).toBe(260)
    expect(clampExpandedWidth(SIDEBAR_EXPANDED_MIN)).toBe(SIDEBAR_EXPANDED_MIN)
    expect(clampExpandedWidth(SIDEBAR_EXPANDED_MAX)).toBe(SIDEBAR_EXPANDED_MAX)
  })

  it('clamps values outside the range, which a hand-edited config can carry', () => {
    expect(clampExpandedWidth(40)).toBe(SIDEBAR_EXPANDED_MIN)
    expect(clampExpandedWidth(9000)).toBe(SIDEBAR_EXPANDED_MAX)
  })

  it('falls back to the default for values that are not finite numbers', () => {
    expect(clampExpandedWidth(undefined)).toBe(SIDEBAR_EXPANDED_DEFAULT)
    expect(clampExpandedWidth(null)).toBe(SIDEBAR_EXPANDED_DEFAULT)
    expect(clampExpandedWidth('280')).toBe(SIDEBAR_EXPANDED_DEFAULT)
    expect(clampExpandedWidth(Number.NaN)).toBe(SIDEBAR_EXPANDED_DEFAULT)
    expect(clampExpandedWidth(Number.POSITIVE_INFINITY)).toBe(SIDEBAR_EXPANDED_DEFAULT)
  })

  it('rounds sub-pixel pointer positions', () => {
    expect(clampExpandedWidth(280.6)).toBe(281)
  })
})

describe('resolveDragState', () => {
  const expanded = { collapsed: false, expandedWidth: 300 }
  const collapsed = { collapsed: true, expandedWidth: 300 }

  it('tracks the pointer while expanded', () => {
    expect(resolveDragState(280, expanded)).toEqual({ collapsed: false, expandedWidth: 280 })
  })

  it('clamps to the expanded bounds instead of following the pointer past them', () => {
    expect(resolveDragState(500, expanded)).toEqual({
      collapsed: false,
      expandedWidth: SIDEBAR_EXPANDED_MAX
    })
    expect(resolveDragState(SIDEBAR_COLLAPSE_THRESHOLD, expanded)).toEqual({
      collapsed: false,
      expandedWidth: SIDEBAR_EXPANDED_MIN
    })
  })

  it('collapses below the collapse threshold', () => {
    expect(resolveDragState(SIDEBAR_COLLAPSE_THRESHOLD - 1, expanded).collapsed).toBe(true)
  })

  it('carries the expanded width through a collapse so re-expanding restores it', () => {
    const next = resolveDragState(100, expanded)
    expect(next).toEqual({ collapsed: true, expandedWidth: 300 })
  })

  it('stays collapsed until the pointer passes the higher expand threshold', () => {
    expect(resolveDragState(SIDEBAR_EXPAND_THRESHOLD - 1, collapsed)).toBe(collapsed)
    expect(resolveDragState(SIDEBAR_EXPAND_THRESHOLD, collapsed)).toEqual({
      collapsed: false,
      expandedWidth: SIDEBAR_EXPANDED_MIN
    })
  })

  it('does not oscillate inside the dead band between the two thresholds', () => {
    // A width in the band must be a fixed point from either side; otherwise a stationary
    // pointer would flip the sidebar open and shut on every pointermove.
    const band = Math.floor((SIDEBAR_COLLAPSE_THRESHOLD + SIDEBAR_EXPAND_THRESHOLD) / 2)
    expect(resolveDragState(band, collapsed).collapsed).toBe(true)
    expect(resolveDragState(band, expanded).collapsed).toBe(false)
  })
})

describe('resolveRenderedWidth', () => {
  it('renders the rail width while collapsed, ignoring the stored expanded width', () => {
    expect(resolveRenderedWidth({ collapsed: true, expandedWidth: 340 })).toBe(SIDEBAR_RAIL_WIDTH)
  })

  it('honours a wider rail, which macOS needs to contain its window buttons', () => {
    expect(
      resolveRenderedWidth({ collapsed: true, expandedWidth: 340 }, SIDEBAR_RAIL_WIDTH_MAC)
    ).toBe(SIDEBAR_RAIL_WIDTH_MAC)
  })

  it('ignores the rail width while expanded', () => {
    expect(
      resolveRenderedWidth({ collapsed: false, expandedWidth: 300 }, SIDEBAR_RAIL_WIDTH_MAC)
    ).toBe(300)
  })

  it('clamps the stored width on read', () => {
    expect(resolveRenderedWidth({ collapsed: false, expandedWidth: 12 })).toBe(SIDEBAR_EXPANDED_MIN)
  })
})
