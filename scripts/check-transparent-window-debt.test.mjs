import { describe, expect, it } from 'vitest'

import {
  KNOWN_TRANSPARENT_WITHOUT_BACKGROUND,
  readWindowOptions,
  transparentWithoutBackground,
} from './check-transparent-window-debt.mjs'

/**
 * The ratchet guarding #806. Reads the real config, so a restructure that defeats the parser has
 * to fail loudly rather than quietly reporting zero.
 */
describe('transparent windows without a background colour', () => {
  it('parses the config it means to measure', () => {
    // Positive control. Regex over source is brittle by nature: renaming the exports, or moving
    // them to another file, would return an empty list and read as "debt repaired".
    const options = readWindowOptions()

    expect(options.length).toBeGreaterThanOrEqual(8)
    expect(options.map(option => option.name)).toContain('MainWindowOption')
    expect(options.some(option => option.hasBackgroundColor)).toBe(true)
    expect(options.some(option => !option.transparent)).toBe(true)
  })

  it('holds at the pinned count, in both directions', () => {
    // Above the pin is a new window that renders black on a Linux desktop with no compositor and
    // looks perfect wherever it gets reviewed. Below it is repair that did not move the floor.
    expect(transparentWithoutBackground()).toHaveLength(KNOWN_TRANSPARENT_WITHOUT_BACKGROUND)
  })

  it('counts only the combination that has nothing to fall back to', () => {
    // transparent with a backgroundColor is fine -- ScreenshotOverlay does exactly that -- and so
    // is opaque without one. Only the pair is the problem, so only the pair is counted.
    for (const option of transparentWithoutBackground()) {
      expect(option.transparent).toBe(true)
      expect(option.hasBackgroundColor).toBe(false)
    }
  })
})
