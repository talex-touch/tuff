// Adapted from Beautiful UI (https://www.beautifului.dev), © 2026 Shane Levine, MIT.
import { withInstall } from '../../../utils/withInstall'
import TxChartScrubber from './src/TxChartScrubber.vue'
import TxSparkChart from './src/TxSparkChart.vue'

/**
 * TxSparkChart — the static multi-series polyline behind a Beautiful UI
 * insight card, painted on canvas.
 *
 * `TxChartScrubber` is the DOM layer that goes over it: pointer→sample mapping,
 * the cursor hairline and the edge-clamped tooltip. They ship together because
 * the scrubber's index maths is the chart's x-projection read backwards, but
 * either works alone — the scrubber over any content, the chart with no cursor.
 *
 * @example
 * ```ts
 * import { TxChartScrubber, TxSparkChart } from '@talex-touch/tuffex'
 *
 * // <TxChartScrubber :point-count="8" :rows="rows" @scrub="onScrub">
 * //   <TxSparkChart :series="series" grid />
 * // </TxChartScrubber>
 * ```
 *
 * @public
 */
const SparkChart = withInstall(TxSparkChart)
const ChartScrubber = withInstall(TxChartScrubber)

export { ChartScrubber, SparkChart, TxChartScrubber, TxSparkChart }
export type {
  ChartScrubberEmits,
  ChartScrubberProps,
  ChartTooltipRow,
  SparkChartPadding,
  SparkChartProps,
  SparkChartTheme,
  SparkPoint,
  SparkSeries,
} from './src/types'
export type TxSparkChartInstance = InstanceType<typeof TxSparkChart>
export type TxChartScrubberInstance = InstanceType<typeof TxChartScrubber>

export default SparkChart
