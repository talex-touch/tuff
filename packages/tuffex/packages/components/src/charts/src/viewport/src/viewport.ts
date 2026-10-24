/**
 * View-window math for continuous x axes: where a zoom, a pan or a pinch
 * leaves the window, how far past the data a drag may pull it, and how a
 * released pan glides. Windows are `[from, to]` in view space — the axis' own
 * units on linear and time axes, decades on a log axis — so the same gesture
 * moves the same distance on screen anywhere on the axis.
 */

import type { ScaleKind } from '../../core/types'
import { rubberband } from '../../../../../../utils/gesture'

export type ViewWindow = [number, number]

/** Converts data values to the space a window moves in, and back. */
export interface ViewSpace {
  to: (value: number) => number
  from: (value: number) => number
}

const IDENTITY: ViewSpace = { to: value => value, from: value => value }
const DECADES: ViewSpace = { to: Math.log10, from: value => 10 ** value }

export function viewSpace(kind: ScaleKind): ViewSpace {
  return kind === 'log' ? DECADES : IDENTITY
}

/** Minimum drag distance (px) before a press brushes; anything shorter is a click. */
export const BRUSH_MIN_DRAG_PX = 4

export interface BrushRect {
  x: number
  width: number
}

/** Selection rectangle for the current drag, clamped to the plot. */
export function brushRect(
  startX: number,
  currentX: number,
  plotX: number,
  plotWidth: number,
): BrushRect {
  const lo = Math.max(plotX, Math.min(startX, currentX))
  const hi = Math.min(plotX + plotWidth, Math.max(startX, currentX))
  return { x: lo, width: Math.max(0, hi - lo) }
}

/**
 * Converts a finished drag into an ordered `[from, to]` range via the scale's
 * inverse, or `null` when the drag was too small to count.
 */
export function brushRange(
  startX: number,
  endX: number,
  invert: (px: number) => number,
): [number, number] | null {
  if (Math.abs(endX - startX) < BRUSH_MIN_DRAG_PX)
    return null
  const a = invert(startX)
  const b = invert(endX)
  return a <= b ? [a, b] : [b, a]
}

/**
 * The narrowest window a zoom may reach: two neighbouring data points, but
 * never under a ten-thousandth of the data. `stops` are sorted, in view space.
 */
export function minimumSpan(stops: readonly number[], extent: ViewWindow): number {
  const full = extent[1] - extent[0]
  let narrowest = Infinity
  for (let index = 1; index < stops.length; index++)
    narrowest = Math.min(narrowest, stops[index]! - stops[index - 1]!)
  if (!Number.isFinite(narrowest))
    return full / 1000
  return Math.min(full, Math.max(narrowest, full / 10_000))
}

/** The window scaled by `factor` (above 1 zooms in) around `anchor`, which stays put on screen. */
export function zoomWindow(window: ViewWindow, factor: number, anchor: number): ViewWindow {
  return [anchor + (window[0] - anchor) / factor, anchor + (window[1] - anchor) / factor]
}

/** Keeps a window's span between `minSpan` and the data's, then moves it inside the data. */
export function containWindow(window: ViewWindow, extent: ViewWindow, minSpan: number): ViewWindow {
  const full = extent[1] - extent[0]
  let from = Math.min(window[0], window[1])
  let to = Math.max(window[0], window[1])
  const floor = Math.min(minSpan, full)
  if (to - from < floor) {
    const middle = (from + to) / 2
    from = middle - floor / 2
    to = middle + floor / 2
  }
  if (to - from >= full)
    return [extent[0], extent[1]]
  if (from < extent[0]) {
    to += extent[0] - from
    from = extent[0]
  }
  if (to > extent[1]) {
    from -= to - extent[1]
    to = extent[1]
  }
  return [from, to]
}

/** How far a window sits past the data: negative past the start, positive past the end. */
export function overshoot(window: ViewWindow, extent: ViewWindow): number {
  if (window[0] < extent[0])
    return window[0] - extent[0]
  if (window[1] > extent[1])
    return window[1] - extent[1]
  return 0
}

/**
 * A dragged window as drawn: the part pulled past the data resists like a
 * rubber band, measured in screen pixels against the plot's width.
 */
export function resistWindow(
  window: ViewWindow,
  extent: ViewWindow,
  unitsPerPx: number,
  plotWidth: number,
): ViewWindow {
  const over = overshoot(window, extent)
  if (over === 0 || !(unitsPerPx > 0))
    return window
  const shown = rubberband(over / unitsPerPx, plotWidth) * unitsPerPx
  return [window[0] - over + shown, window[1] - over + shown]
}

/** Whether a window shows all of the data, give or take rounding. */
export function coversExtent(window: ViewWindow, extent: ViewWindow): boolean {
  const slack = (extent[1] - extent[0]) * 1e-6
  return window[0] <= extent[0] + slack && window[1] >= extent[1] - slack
}
