// Adapted from Beautiful UI (https://www.beautifului.dev), © 2026 Shane Levine, MIT.
//
// Pure projection maths for TxSparkChart and TxChartScrubber. Kept out of the
// SFCs so the mapping can be tested without a canvas: jsdom returns null from
// `getContext('2d')`, which would otherwise make every drawing path untestable.

import type { SparkChartPadding, SparkSeries } from './types'

export const DEFAULT_CHART_PADDING: SparkChartPadding = {
  top: 24,
  right: 0,
  bottom: 22,
  left: 0,
}

export interface ProjectedPoint {
  x: number
  y: number
}

export interface ProjectionBox {
  width: number
  height: number
  padding: SparkChartPadding
}

export function resolvePadding(padding?: Partial<SparkChartPadding>): SparkChartPadding {
  return {
    top: padding?.top ?? DEFAULT_CHART_PADDING.top,
    right: padding?.right ?? DEFAULT_CHART_PADDING.right,
    bottom: padding?.bottom ?? DEFAULT_CHART_PADDING.bottom,
    left: padding?.left ?? DEFAULT_CHART_PADDING.left,
  }
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/**
 * Fits every series into one shared value range. A flat series is padded by ±1
 * so it draws through the middle instead of collapsing onto an edge.
 */
export function resolveValueDomain(
  series: SparkSeries[],
  explicit?: [number, number],
): [number, number] {
  if (explicit)
    return explicit

  let min = Number.POSITIVE_INFINITY
  let max = Number.NEGATIVE_INFINITY

  for (const item of series) {
    for (const point of item.data) {
      if (!Number.isFinite(point.value))
        continue
      if (point.value < min)
        min = point.value
      if (point.value > max)
        max = point.value
    }
  }

  if (!Number.isFinite(min) || !Number.isFinite(max))
    return [0, 1]
  if (min === max)
    return [min - 1, max + 1]

  return [min, max]
}

/**
 * Shared time range. A zero span (single sample, or every sample stamped alike)
 * returns a collapsed range and callers fall back to index spacing.
 */
export function resolveTimeDomain(series: SparkSeries[]): [number, number] {
  let min = Number.POSITIVE_INFINITY
  let max = Number.NEGATIVE_INFINITY

  for (const item of series) {
    for (const point of item.data) {
      if (!Number.isFinite(point.time))
        continue
      if (point.time < min)
        min = point.time
      if (point.time > max)
        max = point.time
    }
  }

  if (!Number.isFinite(min) || !Number.isFinite(max))
    return [0, 0]

  return [min, max]
}

export function projectSeries(
  series: SparkSeries,
  box: ProjectionBox,
  timeDomain: [number, number],
  valueDomain: [number, number],
): ProjectedPoint[] {
  const innerWidth = Math.max(0, box.width - box.padding.left - box.padding.right)
  const innerHeight = Math.max(0, box.height - box.padding.top - box.padding.bottom)
  const [timeMin, timeMax] = timeDomain
  const [valueMin, valueMax] = valueDomain
  const timeSpan = timeMax - timeMin
  const valueSpan = valueMax - valueMin || 1
  const count = series.data.length

  return series.data.map((point, index) => {
    let ratio: number
    if (count <= 1) {
      ratio = 0.5
    } else if (timeSpan > 0) {
      ratio = clamp((point.time - timeMin) / timeSpan, 0, 1)
    } else {
      ratio = index / (count - 1)
    }

    return {
      x: box.padding.left + ratio * innerWidth,
      y: box.padding.top + (1 - clamp((point.value - valueMin) / valueSpan, 0, 1)) * innerHeight,
    }
  })
}

/** Pointer progress (0–1 across the stage) to the nearest sample index. */
export function indexFromRatio(ratio: number, pointCount: number): number {
  if (pointCount <= 1)
    return 0
  return Math.round(clamp(ratio, 0, 1) * (pointCount - 1))
}

/** Sample index back to progress, for placing the cursor line. */
export function ratioFromIndex(index: number, pointCount: number): number {
  if (pointCount <= 1)
    return 0
  return clamp(index, 0, pointCount - 1) / (pointCount - 1)
}

/**
 * Keeps the tooltip anchor away from the stage edges. Upstream clamps to
 * 28–72% so a 154px-wide tooltip never overhangs a 380px card.
 */
export function clampAnchorPercent(percent: number, min = 28, max = 72): number {
  if (min > max)
    return percent
  return clamp(percent, min, max)
}
