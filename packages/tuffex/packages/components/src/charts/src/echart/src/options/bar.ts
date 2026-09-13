import type { EChartsOption } from 'echarts'
import type { EChartSharedProps } from '../core/types'
import { mergeChartOption } from '../core/shared'

export interface BarChartSeriesInput {
  name: string
  /** One value per category. */
  data: number[]
  color?: string
  /** Stack id — series sharing one id stack on top of each other. */
  stack?: string
}

export interface BarChartProps extends EChartSharedProps {
  series: BarChartSeriesInput[]
  /** Category labels; omit to plot against the sample index. */
  categories?: string[]
  xAxisName?: string
  yAxisName?: string
  /** @default true when more than one series is passed */
  showLegend?: boolean
  /** Split lines behind the series. @default true */
  grid?: boolean
  /** Share one stack id across every series that does not declare its own. @default false */
  stacked?: boolean
  /** Draw horizontal bars: the value axis moves to `xAxis`, categories to `yAxis`. @default false */
  horizontal?: boolean
  /** Fixed bar thickness; auto-sized when omitted. */
  barWidth?: number | string
  /** Value labels on every bar. @default false */
  showLabel?: boolean
}

/** Pure option builder — colours, axes and legend styling come from TxEChart. */
export function buildBarChartOption(props: BarChartProps): EChartsOption {
  const {
    series,
    categories,
    xAxisName,
    yAxisName,
    grid = true,
    stacked = false,
    horizontal = false,
    barWidth,
    showLabel = false,
  } = props
  const showLegend = props.showLegend ?? series.length > 1

  const categoryAxis = {
    type: 'category' as const,
    ...(categories ? { data: categories } : {}),
    ...(grid ? {} : { splitLine: { show: false } }),
  }
  const valueAxis = {
    type: 'value' as const,
    ...(grid ? {} : { splitLine: { show: false } }),
  }
  const named = (axis: object, name?: string) => (name ? { ...axis, name } : axis)

  return mergeChartOption<EChartsOption>({
    ...(showLegend ? { legend: {} } : {}),
    grid: {},
    tooltip: { trigger: 'axis' },
    xAxis: horizontal ? named(valueAxis, xAxisName) : named(categoryAxis, xAxisName),
    yAxis: horizontal ? named(categoryAxis, yAxisName) : named(valueAxis, yAxisName),
    series: series.map(entry => ({
      name: entry.name,
      type: 'bar' as const,
      data: entry.data,
      stack: entry.stack ?? (stacked ? 'total' : undefined),
      ...(barWidth === undefined ? {} : { barWidth }),
      ...(showLabel
        ? { label: { show: true, position: horizontal ? 'right' as const : 'top' as const } }
        : {}),
      itemStyle: entry.color ? { color: entry.color } : undefined,
      emphasis: { focus: 'series' as const },
    })),
  })
}
