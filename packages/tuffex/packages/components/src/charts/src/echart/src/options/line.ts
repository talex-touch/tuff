import type { EChartsOption } from 'echarts'
import type { EChartSharedProps } from '../core/types'
import { mergeChartOption } from '../core/shared'

export interface LineChartSeriesInput {
  name: string
  /** Values per sample, or `[x, y]` pairs for a value/time x-axis. */
  data: number[] | Array<[number, number]>
  color?: string
  /** Fill under the line. */
  area?: boolean
  /** Monotone cubic stroke. @default true */
  smooth?: boolean
  /** Stack id — series sharing one id stack on top of each other. */
  stack?: string
  /** Dashed stroke, for targets and forecasts. */
  dashed?: boolean
}

export interface LineChartProps extends EChartSharedProps {
  series: LineChartSeriesInput[]
  /** Category labels; omit to plot against the sample index or `[x, y]` pairs. */
  categories?: string[]
  xAxisName?: string
  yAxisName?: string
  /** @default true when more than one series is passed */
  showLegend?: boolean
  /** Split lines behind the series. @default true */
  grid?: boolean
}

/** Pure option builder — colours, axes and legend styling come from TxEChart. */
export function buildLineChartOption(props: LineChartProps): EChartsOption {
  const { series, categories, xAxisName, yAxisName, grid = true } = props
  const showLegend = props.showLegend ?? series.length > 1
  const paired = series.some(entry => Array.isArray(entry.data[0]))

  return mergeChartOption<EChartsOption>({
    ...(showLegend ? { legend: {} } : {}),
    grid: {},
    tooltip: { trigger: 'axis' },
    xAxis: {
      type: categories || !paired ? 'category' : 'value',
      ...(categories ? { data: categories } : {}),
      ...(grid ? {} : { splitLine: { show: false } }),
      ...(xAxisName ? { name: xAxisName } : {}),
    },
    yAxis: {
      type: 'value',
      ...(grid ? {} : { splitLine: { show: false } }),
      ...(yAxisName ? { name: yAxisName } : {}),
    },
    series: series.map(entry => ({
      name: entry.name,
      type: 'line',
      data: entry.data,
      smooth: entry.smooth ?? true,
      showSymbol: false,
      symbol: 'circle',
      symbolSize: 6,
      stack: entry.stack,
      lineStyle: {
        width: 2,
        ...(entry.dashed ? { type: 'dashed' as const } : {}),
        ...(entry.color ? { color: entry.color } : {}),
      },
      itemStyle: entry.color ? { color: entry.color } : undefined,
      emphasis: { focus: 'series' as const },
      ...(entry.area
        ? { areaStyle: { opacity: entry.stack ? 0.35 : 0.16 } }
        : {}),
    })),
  }, axisNames(xAxisName, yAxisName))
}

/** Axis names are optional decoration, so they are only added when asked for. */
function axisNames(xAxisName?: string, yAxisName?: string): EChartsOption | undefined {
  if (!xAxisName && !yAxisName)
    return undefined
  return {
    ...(xAxisName ? { xAxis: { name: xAxisName } } : {}),
    ...(yAxisName ? { yAxis: { name: yAxisName } } : {}),
  }
}
