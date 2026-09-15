import type { EChartsOption } from 'echarts'
import type { EChartSharedProps } from '../core/types'
import { mergeChartOption } from '../core/shared'

export interface GaugeChartProps extends EChartSharedProps {
  /** Current reading. */
  value: number
  /** Bottom of the scale. @default 0 */
  min?: number
  /** Top of the scale. @default 100 */
  max?: number
  /** Caption under the reading, e.g. the metric name. */
  name?: string
  /** Suffix appended to the reading, e.g. `%`. */
  unit?: string
  /** Decimals shown on the reading. @default 0 */
  precision?: number
  /**
   * Thin ring look: a full-circle progress arc with no pointer, ticks or axis
   * labels, instead of the classic dial. @default false
   */
  progress?: boolean
  /**
   * Dial subdivisions, ECharts `splitNumber`; the ring look hides every mark it
   * would draw. @default 5
   */
  segments?: number
  /** Accent for the progress arc and the reading; the dial itself stays themed. */
  color?: string
}

/** Pure option builder — colours, dial chrome and layout come from TxEChart. */
export function buildGaugeChartOption(props: GaugeChartProps): EChartsOption {
  const { value, name, unit, progress = false, color } = props
  const min = props.min ?? 0
  const max = props.max ?? 100
  const precision = props.precision ?? 0
  const segments = props.segments ?? 5

  return mergeChartOption<EChartsOption>({
    series: [{
      type: 'gauge',
      min,
      max,
      splitNumber: segments,
      ...(progress
        ? {
            startAngle: 90,
            endAngle: -270,
            pointer: { show: false },
            progress: {
              show: true,
              width: 10,
              ...(color ? { itemStyle: { color } } : {}),
            },
            axisLine: { lineStyle: { width: 10 } },
            splitLine: { show: false },
            axisTick: { show: false },
            axisLabel: { show: false },
          }
        : {}),
      detail: {
        formatter: readingText(precision, unit),
        ...(color ? { color } : {}),
      },
      ...(name ? { title: { show: true, offsetCenter: [0, '68%'] } } : {}),
      data: [{ value, ...(name ? { name } : {}) }],
    }],
  })
}

/** Reading text: the value at the requested precision, with the unit appended. */
function readingText(precision: number, unit?: string): (value: number) => string {
  return (value: number) => `${value.toFixed(precision)}${unit ?? ''}`
}
