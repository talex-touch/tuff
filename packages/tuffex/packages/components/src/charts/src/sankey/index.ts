import '../style/index.scss'
import type {
  SankeyChartProps,
  SankeyLabels,
  SankeyLinkData,
  SankeyNodeData,
  SankeyTooltipParams,
} from './src/types'
import { withInstall } from '../utils/with-install'
import component from './src/TxSankeyChart.vue'

const TxSankeyChart = withInstall(component)

export { TxSankeyChart }
export { computeSankeyLayout, offsetSankeyLayout, resolveEdgeInset } from './src/layout'
export type {
  PositionedSankeyLink,
  PositionedSankeyNode,
  SankeyLayoutOptions,
  SankeyLayoutResult,
} from './src/layout'
export { SANKEY_DEFAULT_LABELS } from './src/types'
export type {
  SankeyChartProps,
  SankeyLabels,
  SankeyLinkData,
  SankeyNodeData,
  SankeyTooltipParams,
}
export type TxSankeyChartInstance = InstanceType<typeof component>

export default TxSankeyChart
