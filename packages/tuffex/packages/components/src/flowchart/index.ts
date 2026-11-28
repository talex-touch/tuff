import { withInstall } from '../../../utils/withInstall'
import TxFlowchart from './src/TxFlowchart.vue'

/**
 * TxFlowchart — interactive workflow canvas with Bezier/stepped connectors,
 * directional markers, travelling pulse beams, execution statuses, and pan/zoom HUD.
 *
 * A controlled primitive: it places `nodes` at the coordinates it is given and
 * reports drags through `node-move` without writing to the array. Card bodies
 * can come from the `#node` slot or lightweight built-in card fields.
 *
 * @example
 * ```ts
 * import { TxFlowchart } from '@talex-touch/tuffex/flowchart'
 *
 * // <TxFlowchart :nodes="nodes" :edges="edges" draggable ports controls @node-move="place" />
 * ```
 *
 * @public
 */
withInstall(TxFlowchart)

export { TxFlowchart }
export { TxFlowchart as Flowchart }
export type {
  FlowBackground,
  FlowchartEmits,
  FlowchartLabels,
  FlowchartProps,
  FlowDirection,
  FlowEdge,
  FlowEdgeMarker,
  FlowEdgeType,
  FlowNode,
  FlowNodeStatus,
  FlowNodeTone,
  FlowViewport,
} from './src/types'
export type TxFlowchartInstance = InstanceType<typeof TxFlowchart>

export default TxFlowchart
