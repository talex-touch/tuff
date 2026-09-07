// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import {
  buildScaleFlipKeyframes,
  captureFlipSnapshot,
  computeFlipDelta,
  playFlip,
  type FlipRect
} from './flip-layout'

function rect(left: number, top: number, width: number, height: number): FlipRect {
  return { left, top, width, height }
}

function element(
  key: string,
  mode: 'move' | 'scale',
  box: FlipRect,
  withInner = false
): HTMLElement {
  const el = document.createElement('div')
  el.dataset.flipKey = key
  el.dataset.flip = mode
  el.getBoundingClientRect = () =>
    ({
      ...box,
      right: box.left + box.width,
      bottom: box.top + box.height,
      x: box.left,
      y: box.top,
      toJSON: () => box
    }) as DOMRect
  el.animate = vi.fn(() => ({}) as Animation)
  if (withInner) {
    const inner = document.createElement('div')
    inner.dataset.flipInner = ''
    inner.animate = vi.fn(() => ({}) as Animation)
    el.appendChild(inner)
  }
  return el
}

describe('computeFlipDelta', () => {
  it('is null when nothing moved or resized', () => {
    expect(computeFlipDelta(rect(10, 10, 80, 90), rect(10, 10, 80, 90))).toBeNull()
    expect(computeFlipDelta(rect(10, 10, 80, 90), rect(10.2, 10, 80.3, 90))).toBeNull()
  })

  it('points from the new box back to the old one', () => {
    expect(computeFlipDelta(rect(100, 0, 84, 90), rect(0, 60, 52, 64))).toEqual({
      dx: 100,
      dy: -60,
      sx: 84 / 52,
      sy: 90 / 64
    })
  })
})

describe('buildScaleFlipKeyframes', () => {
  it('starts at the old box and ends at identity, with the inner cancelling the box scale', () => {
    const { outer, inner } = buildScaleFlipKeyframes({ dx: 30, dy: -20, sx: 2, sy: 1.5 }, 4)

    expect(outer[0]?.transform).toBe('translate(30px, -20px) scale(2, 1.5)')
    expect(outer.at(-1)?.transform).toBe('translate(0px, 0px) scale(1, 1)')
    expect(inner[0]?.transform).toBe('scale(0.5, 0.6666666666666666)')
    expect(inner.at(-1)?.transform).toBe('scale(1, 1)')
    // Sampled together so the content never breathes between frames.
    for (let index = 0; index < outer.length; index += 1) {
      const box = /scale\(([\d.]+), ([\d.]+)\)/.exec(String(outer[index]?.transform))
      const counter = /scale\(([\d.]+), ([\d.]+)\)/.exec(String(inner[index]?.transform))
      expect(Number(box?.[1]) * Number(counter?.[1])).toBeCloseTo(1, 6)
      expect(Number(box?.[2]) * Number(counter?.[2])).toBeCloseTo(1, 6)
    }
  })
})

describe('captureFlipSnapshot / playFlip', () => {
  it('animates rows by translation and tiles by a counter-scaled morph', () => {
    const root = document.createElement('div')
    const tile = element('tile', 'scale', rect(0, 0, 84, 90), true)
    const row = element('row', 'move', rect(0, 200, 600, 56))
    const still = element('still', 'move', rect(0, 300, 600, 56))
    root.append(tile, row, still)

    const snapshot = captureFlipSnapshot(root)
    expect(snapshot?.rects.size).toBe(3)

    // The preview pane opened: the tile shrank in place, the row moved up, the last row stayed.
    tile.getBoundingClientRect = () => ({ left: 0, top: 0, width: 52, height: 64 }) as DOMRect
    row.getBoundingClientRect = () => ({ left: 0, top: 160, width: 240, height: 56 }) as DOMRect

    expect(playFlip(root, snapshot, 200)).toBe(2)

    const tileFrames = (tile.animate as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as Keyframe[]
    expect(tileFrames[0]?.transform).toContain(`scale(${84 / 52}, ${90 / 64})`)
    const inner = tile.querySelector<HTMLElement>('[data-flip-inner]')
    expect(inner?.animate).toHaveBeenCalledTimes(1)

    const rowFrames = (row.animate as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as Keyframe[]
    expect(rowFrames).toEqual([
      { transform: 'translate(0px, 40px)' },
      { transform: 'translate(0px, 0px)' }
    ])
    expect(still.animate).not.toHaveBeenCalled()
  })

  it('returns nothing to play without a snapshot or without opted-in elements', () => {
    const root = document.createElement('div')
    expect(captureFlipSnapshot(root)).toBeNull()
    expect(playFlip(root, null)).toBe(0)
    expect(playFlip(null, { rects: new Map() })).toBe(0)
  })
})
