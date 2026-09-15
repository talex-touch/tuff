import type { EChartsOption } from 'echarts'
import type { EChartSharedProps } from '../core/types'
import { mergeChartOption } from '../core/shared'

export interface FunnelChartDatum {
  name: string
  value: number
  /** Per-stage colour override; the palette fills the rest. */
  color?: string
}

export interface FunnelChartProps extends EChartSharedProps {
  /** Stages in funnel order — the first entry is the conversion base. */
  data: FunnelChartDatum[]
  /** Stage ordering; `none` keeps the caller's order. @default 'descending' */
  sort?: 'descending' | 'ascending' | 'none'
  /** Pixels between stages. @default 2 */
  gap?: number
  /** Smallest stage size, as an ECharts length. @default '0%' */
  minSize?: string
  /** Largest stage size, as an ECharts length. @default '100%' */
  maxSize?: string
  /** Where stage labels sit. `'outside'` is emitted as ECharts' own `'outer'`. @default 'inside' */
  labelPosition?: 'inside' | 'outside' | 'left' | 'right'
  /** Draw the stage name, its value and its share of the first stage. @default true */
  showLabel?: boolean
  /** @default true */
  showLegend?: boolean
  /** Suffix appended to tooltip values, e.g. `'人'`. */
  unit?: string
}

/** Shape of the params ECharts hands to a funnel label callback. */
interface FunnelLabelParams {
  name?: string
  value?: unknown
  dataIndex?: number
}

/** Pure option builder — colours, legend chrome and tooltip styling come from TxEChart. */
export function buildFunnelChartOption(props: FunnelChartProps): EChartsOption {
  const {
    data,
    sort = 'descending',
    gap,
    minSize,
    maxSize,
    labelPosition = 'inside',
    showLabel = true,
    showLegend = true,
    unit,
  } = props

  return mergeChartOption<EChartsOption>({
    ...(showLegend ? { legend: { data: data.map(entry => entry.name) } } : {}),
    tooltip: {
      trigger: 'item',
      ...(unit ? { valueFormatter: (value: unknown) => `${value === undefined || value === null ? '' : String(value)}${unit}` } : {}),
    },
    series: [
      {
        type: 'funnel',
        left: '10%',
        right: '10%',
        top: '8%',
        bottom: '8%',
        sort,
        gap: gap ?? 2,
        ...(minSize ? { minSize } : {}),
        ...(maxSize ? { maxSize } : {}),
        data: data.map(entry => ({
          name: entry.name,
          value: entry.value,
          ...(entry.color ? { itemStyle: { color: entry.color } } : {}),
        })),
        label: showLabel
          ? {
              show: true,
              position: labelPosition === 'outside' ? 'outer' : labelPosition,
              formatter: (params: FunnelLabelParams) => formatStageLabel(params, data),
            }
          : { show: false },
        emphasis: { label: { show: showLabel } },
      },
    ],
  })
}

/** `Stage` on one line, `value (share of the first stage)` on the next. */
function formatStageLabel(params: FunnelLabelParams, data: FunnelChartDatum[]): string {
  const name = params.name ?? ''
  const datum = params.dataIndex === undefined ? undefined : data[params.dataIndex]
  const value = datum ? datum.value : params.value
  if (typeof value !== 'number')
    return name

  const base = data[0]?.value
  if (base === undefined || base <= 0)
    return `${name}\n${value}`
  return `${name}\n${value} (${Math.round((value / base) * 100)}%)`
}
