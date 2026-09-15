import type { EChartsOption } from 'echarts'
import type { EChartSharedProps } from '../core/types'
import { mergeChartOption } from '../core/shared'

export interface PieChartDatum {
  name: string
  value: number
  /** Per-slice colour override; the palette fills the rest. */
  color?: string
}

export interface PieChartProps extends EChartSharedProps {
  /** Slices in draw order — the first entry is the palette's first colour. */
  data: PieChartDatum[]
  /**
   * Hollow the centre: `true` uses the default 60% inner radius, a number is
   * the inner radius as a percentage, clamped to 0–90. @default false
   */
  donut?: boolean | number
  /** Draw slices by value instead of by angle. @default false */
  roseType?: boolean
  /** @default true */
  showLegend?: boolean
  /** Where slice labels sit. @default 'outside' */
  labelPosition?: 'outside' | 'inside' | 'center'
  /** Centre title, shown only for a donut; the legend is unaffected. */
  centerLabel?: string
  /** Suffix appended to tooltip values, e.g. `'次'`. */
  unit?: string
}

/** Inner radius `donut: true` resolves to. */
const DEFAULT_DONUT_INNER_RADIUS = 60
/** Deeper than this and the slices stop reading as a ring. */
const MAX_DONUT_INNER_RADIUS = 90
/** Outer radius, leaving room for outside labels and their leader lines. */
const OUTER_RADIUS = '70%'

/** Pure option builder — colours, legend chrome and tooltip styling come from TxEChart. */
export function buildPieChartOption(props: PieChartProps): EChartsOption {
  const {
    data,
    roseType = false,
    showLegend = true,
    labelPosition = 'outside',
    centerLabel,
    unit,
  } = props
  const innerRadius = resolveInnerRadius(props.donut)

  return mergeChartOption<EChartsOption>({
    ...(showLegend ? { legend: { data: data.map(entry => entry.name) } } : {}),
    ...(centerLabel && innerRadius > 0
      ? { title: { text: centerLabel, left: 'center', top: 'center', textAlign: 'center' } }
      : {}),
    tooltip: {
      trigger: 'item',
      ...(unit
        ? { valueFormatter: (value: unknown) => `${value === undefined || value === null ? '' : String(value)} ${unit}` }
        : {}),
    },
    series: [
      {
        type: 'pie',
        radius: innerRadius > 0 ? [`${innerRadius}%`, OUTER_RADIUS] : OUTER_RADIUS,
        ...(roseType ? { roseType: 'radius' as const } : {}),
        avoidLabelOverlap: true,
        label: { position: labelPosition },
        data: data.map(entry => ({
          name: entry.name,
          value: entry.value,
          ...(entry.color ? { itemStyle: { color: entry.color } } : {}),
        })),
      },
    ],
  })
}

/** `donut: true` means the family default; a number is the caller's own radius, clamped. */
function resolveInnerRadius(donut: boolean | number | undefined): number {
  if (donut === undefined || donut === false)
    return 0
  const requested = donut === true ? DEFAULT_DONUT_INNER_RADIUS : donut
  if (!Number.isFinite(requested))
    return 0
  return Math.min(Math.max(Math.round(requested), 0), MAX_DONUT_INNER_RADIUS)
}
