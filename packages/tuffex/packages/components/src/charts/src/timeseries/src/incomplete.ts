// Ported from Cloudflare kumo (MIT) — the incomplete-data slicing in
// packages/kumo/src/components/chart/TimeseriesChart.tsx.

export interface IncompleteSegments {
  /** Solid segment. Overlaps the dashed segments by one point so lines join. */
  complete: Array<[number, number]>
  /** Dashed segment before `incomplete.before`, if any. */
  before: Array<[number, number]>
  /** Dashed segment after `incomplete.after`, if any. */
  after: Array<[number, number]>
}

/**
 * Splits a series into a solid middle and dashed edge segments for
 * incomplete-data periods.
 */
export function splitIncompleteSegments(
  data: Array<[number, number]>,
  incompleteBefore: number | undefined,
  incompleteAfter: number | undefined,
): IncompleteSegments {
  const before = incompleteBefore !== undefined
    ? data.filter(point => point[0] <= incompleteBefore)
    : []
  const after = incompleteAfter !== undefined
    ? data.filter(point => point[0] >= incompleteAfter)
    : []

  const complete = before.length > 0 || after.length > 0
    ? data.slice(
        Math.max(0, before.length - 1),
        Math.max(0, data.length - after.length + 1),
      )
    : data

  return { complete, before, after }
}
