/** Minimum drag distance (px) below which a brush is treated as a click. */
export const BRUSH_MIN_DRAG_PX = 3

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
 * Converts a finished drag into an ordered `[from, to]` time range via the
 * scale's inverse, or `null` when the drag was too small to count.
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
