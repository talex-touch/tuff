import { withInstall } from '../../../utils/withInstall'
import TxFlowchart from './src/TxFlowchart.vue'

/**
 * TxFlowchart — workflow trigger and condition steps on a dotted canvas.
 *
 * A controlled primitive: it places `nodes` at the coordinates it is given and
 * reports drags through `node-move` without writing to the array. Card bodies
 * come from the `node` slot, so the component owns the canvas, the connectors
 * and the category chip, and nothing about what a step *is*.
 *
 * @example
 * ```ts
 * import { TxFlowchart } from '@talex-touch/tuffex'
 *
 * // <TxFlowchart :nodes="nodes" :edges="edges" draggable @node-move="place" />
 * ```
 *
 * @public
 */
withInstall(TxFlowchart)

export { TxFlowchart }
export { TxFlowchart as Flowchart }
export type {
  FlowchartEmits,
  FlowchartProps,
  FlowEdge,
  FlowNode,
  FlowNodeTone,
} from './src/types'
export type TxFlowchartInstance = InstanceType<typeof TxFlowchart>

export default TxFlowchart
