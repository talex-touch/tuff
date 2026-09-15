import type { EChartsOption } from 'echarts'
import type { EChartSharedProps } from '../core/types'
import { mergeChartOption } from '../core/shared'

export interface ScatterSeriesInput {
  name: string
  /** One `[x, y]` point per observation. */
  data: Array<[number, number]>
  color?: string
  /** Dot diameter in px; overrides the chart-level size. */
  symbolSize?: number
}

export interface ScatterChartProps extends EChartSharedProps {
  series: ScatterSeriesInput[]
  xAxisName?: string
  yAxisName?: string
  /** Dot diameter in px for every series. @default 8 */
  symbolSize?: number
  /** @default true when more than one series is passed */
  showLegend?: boolean
  /** Split lines behind the points. @default true */
  grid?: boolean
  xMin?: number
  xMax?: number
  yMin?: number
  yMax?: number
}

/** Pure option builder — colours, axes and legend styling come from TxEChart. */
export function buildScatterChartOption(props: ScatterChartProps): EChartsOption {
  const { series, xAxisName, yAxisName, symbolSize = 8, grid = true } = props
  const showLegend = props.showLegend ?? series.length > 1

  return mergeChartOption<EChartsOption>({
    ...(showLegend ? { legend: {} } : {}),
    grid: {},
    tooltip: {
      trigger: 'item',
      axisPointer: { type: 'cross' },
    },
    xAxis: {
      type: 'value',
      ...(grid ? {} : { splitLine: { show: false } }),
      ...(xAxisName ? { name: xAxisName } : {}),
      ...bounds('min', props.xMin),
      ...bounds('max', props.xMax),
    },
    yAxis: {
      type: 'value',
      ...(grid ? {} : { splitLine: { show: false } }),
      ...(yAxisName ? { name: yAxisName } : {}),
      ...bounds('min', props.yMin),
      ...bounds('max', props.yMax),
    },
    series: series.map(entry => ({
      name: entry.name,
      type: 'scatter',
      data: entry.data,
      symbolSize: entry.symbolSize ?? symbolSize,
      itemStyle: {
        ...(entry.color ? { color: entry.color } : {}),
      },
      emphasis: { focus: 'series' as const },
    })),
  })
}

/** An axis bound is only declared when the caller passed one. */
function bounds(key: 'min' | 'max', value: number | undefined): Record<string, number> {
  return value === undefined ? {} : { [key]: value }
}
