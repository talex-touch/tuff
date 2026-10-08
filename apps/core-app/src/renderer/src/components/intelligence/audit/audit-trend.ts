/**
 * The trend chart's data: the window's local days, zero-filled, as `TxTimeseriesChart` series.
 *
 * Pure so the two decisions that make the chart read correctly are testable without a layout:
 * where each bar sits (`localMidnight`, see there) and the hidden padding series that keeps the
 * first and last bars whole.
 */
import type { TimeseriesData } from '@talex-touch/tuffex/charts'
import type {
  UsageInsights,
  UsageTotals
} from '@talex-touch/utils/transport/sdk/domains/intelligence'
import { DAY_MS, daysBetween, localMidnight } from './audit-format'

export type TrendMetric = 'tokens' | 'requests' | 'cost'

export interface TrendDay {
  /** The main process's local day key. */
  day: string
  /** This process's midnight for that day: the bar's x. */
  at: number
  totals: UsageTotals
}

const ZERO_TOTALS: UsageTotals = {
  requestCount: 0,
  successCount: 0,
  failureCount: 0,
  promptTokens: 0,
  completionTokens: 0,
  totalTokens: 0,
  estimatedCostUsd: 0,
  avgLatencyMs: null
}

/**
 * Every day of the window, in order. The main process returns only days with calls; a day with
 * none is a real zero here, so the axis does not close up around a gap and claim two distant
 * days were neighbours.
 */
export function trendDays(insights: Pick<UsageInsights, 'window' | 'days'>): TrendDay[] {
  const byDay = new Map(insights.days.map(({ day, ...totals }) => [day, totals]))
  const days: TrendDay[] = []
  for (const day of daysBetween(insights.window.startDay, insights.window.endDay)) {
    const at = localMidnight(day)
    if (at === null) continue
    days.push({ day, at, totals: byDay.get(day) ?? { ...ZERO_TOTALS } })
  }
  return days
}

/**
 * Tokens a day reports beyond its input and output.
 *
 * A bar stacks input on output, and the headline is `totalTokens`; a provider that counts tokens
 * neither side claims would leave the stack shorter than the number above it. The remainder is
 * drawn as its own piece when there is one, so the two always agree.
 */
export function otherTokens(totals: UsageTotals): number {
  return Math.max(0, totals.totalTokens - totals.promptTokens - totals.completionTokens)
}

/**
 * The hidden series' name. No translated label reads like this, so it cannot collide with a
 * visible series.
 */
export const TREND_PADDING_SERIES = '__audit-trend-padding__'

export interface TrendSeriesStyle {
  name: string
  color: string
}

export interface TrendSeriesStyles {
  input: TrendSeriesStyle
  output: TrendSeriesStyle
  other: TrendSeriesStyle
  success: TrendSeriesStyle
  failure: TrendSeriesStyle
  cost: TrendSeriesStyle
}

/**
 * The series for one metric, bars stacked bottom-up in array order, then the padding series.
 *
 * Padding: the chart's x domain runs from the first timestamp to the last, so the first and last
 * bars would be centred on the plot's edges and half clipped away. A hidden series with a point
 * half a day beyond each end widens the domain (it reads every series, hidden or not) without
 * drawing anything, taking part in the y domain or the tooltip (those read visible series only),
 * or narrowing a bar (bar width comes from each series' own spacing). It goes last, so the
 * palette slots of the visible series do not move.
 */
export function buildTrendSeries(
  days: readonly TrendDay[],
  metric: TrendMetric,
  styles: TrendSeriesStyles
): TimeseriesData[] {
  const series = (style: TrendSeriesStyle, value: (totals: UsageTotals) => number) => ({
    name: style.name,
    color: style.color,
    data: days.map((day): [number, number] => [day.at, value(day.totals)])
  })

  let visible: TimeseriesData[]
  if (metric === 'tokens') {
    visible = [
      series(styles.input, (totals) => totals.promptTokens),
      series(styles.output, (totals) => totals.completionTokens)
    ]
    if (days.some((day) => otherTokens(day.totals) > 0)) {
      visible.push(series(styles.other, otherTokens))
    }
  } else if (metric === 'requests') {
    visible = [
      series(styles.success, (totals) => totals.successCount),
      series(styles.failure, (totals) => totals.failureCount)
    ]
  } else {
    visible = [series(styles.cost, (totals) => totals.estimatedCostUsd)]
  }

  const first = days[0]
  const last = days[days.length - 1]
  if (!first || !last) return visible
  return [
    ...visible,
    {
      name: TREND_PADDING_SERIES,
      data: [
        [first.at - DAY_MS / 2, 0],
        [last.at + DAY_MS / 2, 0]
      ]
    }
  ]
}

/**
 * The day a pointer timestamp belongs to.
 *
 * The chart hands its tooltip formatter the pointer's own time, not the bar's: between two bars
 * that is a moment on one day while the rows below it already show the nearest bar — which may be
 * the next day. Snapping to the nearest bar keeps the title and the rows on the same day.
 */
export function nearestTrendDay(days: readonly TrendDay[], timestamp: number): TrendDay | null {
  let best: TrendDay | null = null
  let distance = Infinity
  for (const day of days) {
    const gap = Math.abs(day.at - timestamp)
    if (gap < distance) {
      distance = gap
      best = day
    }
  }
  return best
}

/**
 * The day a tick falls on, or `null` for a tick between days.
 *
 * d3 picks the tick interval from the span: a week or a day here, but hours for a one-day window.
 * Only a tick that lands on a bar gets a label.
 */
export function trendDayAtTick(days: readonly TrendDay[], timestamp: number): TrendDay | null {
  return days.find((day) => day.at === timestamp) ?? null
}
