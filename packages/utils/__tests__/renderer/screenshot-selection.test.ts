import { describe, expect, it } from 'vitest'

import {
  createScreenshotSelection,
  moveScreenshotSelection,
  nudgeScreenshotSelection,
  projectScreenshotSelection,
  resizeScreenshotSelection,
  setScreenshotSelectionSize,
  snapshotScreenshotSelection,
  type ScreenshotResizeHandle,
} from '../../renderer/screenshot-selection'

const bounds = { x: -1280, y: -200, width: 2720, height: 1100 }

describe('screenshot selection geometry', () => {
  it('creates a normalized global-DIP selection in every drag direction', () => {
    expect(createScreenshotSelection({ x: 100, y: 300 }, { x: -100, y: 100 }, bounds)).toEqual({
      x: -100,
      y: 100,
      width: 200,
      height: 200,
    })
    expect(createScreenshotSelection({ x: -100, y: 100 }, { x: 100, y: 300 }, bounds)).toEqual({
      x: -100,
      y: 100,
      width: 200,
      height: 200,
    })
  })

  it('rejects tiny selections and clamps drag to negative-origin desktop bounds', () => {
    expect(createScreenshotSelection({ x: 0, y: 0 }, { x: 2, y: 2 }, bounds, 4)).toBeNull()
    expect(createScreenshotSelection({ x: -2000, y: -500 }, { x: 2000, y: 2000 }, bounds)).toEqual(bounds)
  })

  it('moves complete rectangles without losing size at any desktop edge', () => {
    const selection = { x: -100, y: 100, width: 200, height: 120 }

    expect(moveScreenshotSelection(selection, -5000, 0, bounds)).toEqual({
      x: -1280,
      y: 100,
      width: 200,
      height: 120,
    })
    expect(moveScreenshotSelection(selection, 5000, 5000, bounds)).toEqual({
      x: 1240,
      y: 780,
      width: 200,
      height: 120,
    })
  })

  it('resizes from every handle while keeping the opposite edge stable', () => {
    const selection = { x: 100, y: 100, width: 200, height: 120 }
    const expectations: Record<ScreenshotResizeHandle, { x: number; y: number; width: number; height: number }> = {
      n: { x: 100, y: 90, width: 200, height: 130 },
      ne: { x: 100, y: 90, width: 210, height: 130 },
      e: { x: 100, y: 100, width: 210, height: 120 },
      se: { x: 100, y: 100, width: 210, height: 130 },
      s: { x: 100, y: 100, width: 200, height: 130 },
      sw: { x: 90, y: 100, width: 210, height: 130 },
      w: { x: 90, y: 100, width: 210, height: 120 },
      nw: { x: 90, y: 90, width: 210, height: 130 },
    }

    for (const [handle, expected] of Object.entries(expectations)) {
      expect(
        resizeScreenshotSelection(
          selection,
          handle as ScreenshotResizeHandle,
          handle.includes('w') ? -10 : 10,
          handle.includes('n') ? -10 : 10,
          bounds,
        ),
      ).toEqual(expected)
    }
  })

  it('preserves fixed ratio and minimum size during resize and manual sizing', () => {
    const selection = { x: 100, y: 100, width: 160, height: 90 }
    expect(
      resizeScreenshotSelection(selection, 'se', 32, 1, bounds, {
        minSize: 4,
        aspectRatio: 16 / 9,
      }),
    ).toEqual({ x: 100, y: 100, width: 192, height: 108 })
    expect(
      setScreenshotSelectionSize(selection, 50, 50, bounds, {
        aspectRatio: 1,
      }),
    ).toEqual({ x: 100, y: 100, width: 50, height: 50 })
  })

  it('supports pixel-level keyboard move and resize', () => {
    const selection = { x: 0, y: 0, width: 100, height: 80 }

    expect(nudgeScreenshotSelection(selection, 'left', false, bounds)).toEqual({
      x: -1,
      y: 0,
      width: 100,
      height: 80,
    })
    expect(nudgeScreenshotSelection(selection, 'down', true, bounds)).toEqual({
      x: 0,
      y: 0,
      width: 100,
      height: 81,
    })
  })

  it('snapshots reactive selections into structured-clone-safe transport payloads', () => {
    const reactiveSelection = new Proxy({ x: -120, y: 40, width: 640, height: 360 }, {})

    expect(() => structuredClone(reactiveSelection)).toThrow()
    expect(structuredClone(snapshotScreenshotSelection(reactiveSelection))).toEqual({
      x: -120,
      y: 40,
      width: 640,
      height: 360,
    })
  })

  it('projects a cross-display selection into local overlay coordinates', () => {
    const selection = { x: -100, y: 50, width: 300, height: 100 }

    expect(
      projectScreenshotSelection(selection, {
        x: -1280,
        y: 0,
        width: 1280,
        height: 720,
      }),
    ).toEqual({ x: 1180, y: 50, width: 100, height: 100 })
    expect(
      projectScreenshotSelection(selection, {
        x: 0,
        y: 0,
        width: 1440,
        height: 900,
      }),
    ).toEqual({ x: 0, y: 50, width: 200, height: 100 })
  })
})
