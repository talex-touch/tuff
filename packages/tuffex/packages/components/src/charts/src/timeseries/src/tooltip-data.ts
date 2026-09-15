// Ported from Cloudflare kumo (MIT) — helpers in
// packages/kumo/src/components/chart/TimeseriesChart.tsx.

import type { TimeseriesData } from './types'

export interface TimeseriesTooltipRow {
  name: string
  value: number
  color: string
}

/** Binary search for the value whose timestamp is closest to `ts`. */
export function findNearest(data: Array<[number, number]>, ts: number): number | null {
  if (data.length === 0)
    return null
  let lo = 0
  let hi = data.length - 1
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if ((data[mid] as [number, number])[0] < ts)
      lo = mid + 1
    else hi = mid
  }
  const current = data[lo] as [number, number]
  const previous = data[lo - 1]
  if (previous && Math.abs(previous[0] - ts) < Math.abs(current[0] - ts))
    return previous[1]
  return current[1]
}

/**
 * One tooltip row per unique series name at the given timestamp, hidden series
 * skipped, sorted by value descending.
 */
export function getAllTooltipRowsAtTimestamp(
  data: TimeseriesData[],
  ts: number,
  hiddenSeries: readonly string[],
  resolveColor: (series: TimeseriesData, index: number) => string,
): TimeseriesTooltipRow[] {
  const seenNames = new Set<string>()
  const rows: TimeseriesTooltipRow[] = []

  data.forEach((series, index) => {
    if (seenNames.has(series.name) || hiddenSeries.includes(series.name))
      return
    seenNames.add(series.name)
    const value = findNearest(series.data, ts)
    if (value != null)
      rows.push({ name: series.name, value, color: resolveColor(series, index) })
  })

  return rows.sort((a, b) => b.value - a.value)
}

export function limitTooltipRows(
  rows: TimeseriesTooltipRow[],
  max: number,
): { rows: TimeseriesTooltipRow[], hiddenCount: number } {
  return {
    rows: rows.slice(0, max),
    hiddenCount: Math.max(0, rows.length - max),
  }
}
