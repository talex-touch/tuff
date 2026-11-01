import type { Distribution } from '../eval-types'

export function emptyDistribution(): Distribution {
  return { count: 0, min: 0, p50: 0, p90: 0, p95: 0, p99: 0, max: 0, mean: 0 }
}

/** Nearest-rank percentile of an ascending array; `p` in 0..100. */
export function percentileSorted(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0
  const rank = Math.ceil((p / 100) * sorted.length)
  return sorted[Math.min(sorted.length - 1, Math.max(0, rank - 1))]
}

/** Non-finite inputs (NaN, ±Infinity) are dropped; use `censoredDistribution` to keep infinities. */
export function distribution(values: readonly number[]): Distribution {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b)
  if (sorted.length === 0) return emptyDistribution()
  let sum = 0
  for (const value of sorted) sum += value
  return {
    count: sorted.length,
    min: sorted[0],
    p50: percentileSorted(sorted, 50),
    p90: percentileSorted(sorted, 90),
    p95: percentileSorted(sorted, 95),
    p99: percentileSorted(sorted, 99),
    max: sorted[sorted.length - 1],
    mean: sum / sorted.length
  }
}

/** Like `distribution`, but `+Infinity` entries (checks that never completed) stay in and push the tail up. */
export function censoredDistribution(values: readonly number[]): Distribution {
  const sorted = values.filter((value) => !Number.isNaN(value)).sort((a, b) => a - b)
  if (sorted.length === 0) return emptyDistribution()
  let sum = 0
  for (const value of sorted) sum += value
  return {
    count: sorted.length,
    min: sorted[0],
    p50: percentileSorted(sorted, 50),
    p90: percentileSorted(sorted, 90),
    p95: percentileSorted(sorted, 95),
    p99: percentileSorted(sorted, 99),
    max: sorted[sorted.length - 1],
    mean: sum / sorted.length
  }
}

export function round(value: number, digits = 1): number {
  const scale = 10 ** digits
  return Math.round(value * scale) / scale
}
