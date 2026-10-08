import { withInstall } from '../utils/with-install'
import component from './src/TxDitherChart.vue'

const TxDitherChart = withInstall(component)
export { TxDitherChart }
export { DITHER_CHART_VARIANTS, DITHER_PATTERNS } from './src/types'
export { DITHER_IDENTICAL_SOURCES, DITHER_SOURCE_COMPONENTS, DITHER_SOURCE_DIFFERENCES } from './src/source-catalog'
export { createDitherScene } from './src/geometry'
export type { DitherScene, DitherShape, SceneInput } from './src/geometry'
export type {
  DitherCell, DitherChartLabels, DitherChartProps, DitherChartVariant, DitherDataset,
  DitherHover, DitherNode, DitherPattern, DitherPeriod, DitherPoint, DitherSeries,
} from './src/types'
export type TxDitherChartInstance = InstanceType<typeof component>
export default TxDitherChart
