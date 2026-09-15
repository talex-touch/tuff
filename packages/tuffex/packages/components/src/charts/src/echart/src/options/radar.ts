import type { EChartsOption } from 'echarts'
import type { EChartSharedProps } from '../core/types'
import { mergeChartOption } from '../core/shared'

export interface RadarIndicator {
  name: string
  /** Outer value of the spoke; each indicator is scaled against its own range. */
  max: number
  /** @default 0 */
  min?: number
}

export interface RadarSeriesInput {
  name: string
  /**
   * One value per indicator. A shorter array is passed through as-is — ECharts
   * leaves the missing spokes empty rather than failing the whole chart.
   */
  data: number[]
  color?: string
  /** Fill the shape. */
  area?: boolean
}

export interface RadarChartProps extends EChartSharedProps {
  /** Spokes, in clockwise order starting at the top. */
  indicators: RadarIndicator[]
  series: RadarSeriesInput[]
  /** @default 'polygon' */
  shape?: 'polygon' | 'circle'
  /** Rings between the centre and the outer edge. @default 4 */
  splitNumber?: number
  /** @default true when more than one series is passed */
  showLegend?: boolean
  /** Indicator labels around the rim. @default true */
  showAxisName?: boolean
}

/** Pure option builder — colours, radii and legend styling come from TxEChart. */
export function buildRadarChartOption(props: RadarChartProps): EChartsOption {
  const { indicators, series, shape = 'polygon', splitNumber = 4 } = props
  const showLegend = props.showLegend ?? series.length > 1
  const showAxisName = props.showAxisName ?? true

  return mergeChartOption<EChartsOption>({
    ...(showLegend ? { legend: {} } : {}),
    tooltip: { trigger: 'item' },
    radar: {
      indicator: indicators,
      shape,
      splitNumber,
      radius: '65%',
      ...(showAxisName ? {} : { axisName: { show: false } }),
    },
    series: series.map(entry => ({
      name: entry.name,
      type: 'radar' as const,
      // A radar series' data is a list of polygons, and each polygon is the
      // value array — one entity here means one wrapped item.
      data: [entry.data],
      symbolSize: 4,
      ...(entry.area ? { areaStyle: { opacity: 0.16 } } : {}),
      lineStyle: entry.color ? { color: entry.color } : undefined,
      itemStyle: entry.color ? { color: entry.color } : undefined,
      emphasis: { focus: 'series' as const },
    })),
  })
}
