import type {
  SankeyChartProps,
  SankeyLinkData,
  SankeyNodeData,
  SankeyTooltipParams,
} from './src/types'
import { withInstall } from '../utils/with-install'
import component from './src/TxSankeyChart.vue'

const TxSankeyChart = withInstall(component)

export { TxSankeyChart }
export { computeSankeyLayout, resolveEdgeInset } from './src/layout'
export type {
  PositionedSankeyLink,
  PositionedSankeyNode,
  SankeyLayoutOptions,
  SankeyLayoutResult,
} from './src/layout'
export type {
  SankeyChartProps,
  SankeyLinkData,
  SankeyNodeData,
  SankeyTooltipParams,
}
export type TxSankeyChartInstance = InstanceType<typeof component>

export default TxSankeyChart
