import type { ScaleBand, ScaleLinear, ScaleTime } from 'd3-scale'
import type { ScaleKind } from './types'
import { scaleBand, scaleLinear, scaleTime } from 'd3-scale'

export type ContinuousScale = ScaleLinear<number, number> | ScaleTime<number, number>
export type ChartXScale = ContinuousScale | ScaleBand<string>
export type ChartYScale = ScaleLinear<number, number>

export function isBandScale(scale: ChartXScale): scale is ScaleBand<string> {
  return 'bandwidth' in scale
}

export function createXScale(
  kind: ScaleKind,
  domain: Array<string | number>,
  range: [number, number],
): ChartXScale {
  if (kind === 'band') {
    return scaleBand<string>()
      .domain(domain.map(String))
      .range(range)
      .paddingInner(0.2)
      .paddingOuter(0.1)
  }
  const numeric = domain.map(Number)
  const lo = numeric[0] ?? 0
  const hi = numeric[numeric.length - 1] ?? 1
  if (kind === 'time')
    return scaleTime().domain([new Date(lo), new Date(hi)]).range(range)
  return scaleLinear().domain([lo, hi]).range(range)
}

export function createYScale(
  domain: [number, number],
  range: [number, number],
  nice: boolean,
): ChartYScale {
  const scale = scaleLinear().domain(domain).range(range)
  if (nice)
    scale.nice()
  return scale
}

/**
 * Positions a datum on the x axis. Band values map to the center of their band
 * so line/scatter series can share an axis with bar series.
 */
export function xPosition(scale: ChartXScale, value: string | number): number {
  if (isBandScale(scale))
    return (scale(String(value)) ?? 0) + scale.bandwidth() / 2
  return scale(value as number & Date)
}

/** Tick values for an x scale: band domains list every band. */
export function xTickValues(scale: ChartXScale, count: number): Array<string | number | Date> {
  if (isBandScale(scale))
    return scale.domain()
  return scale.ticks(count)
}

/**
 * Default tick label formatter. Continuous scales use d3's smart tick format
 * (time scales pick a unit-appropriate representation); bands echo the value.
 */
export function defaultTickFormat(scale: ChartXScale | ChartYScale, count: number): (value: string | number | Date) => string {
  if (isBandScale(scale as ChartXScale))
    return value => String(value)
  const format = (scale as ContinuousScale).tickFormat(count)
  return value => format(value as number & Date)
}
