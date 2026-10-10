import type { FlowLightProps, FlowLightVariant } from './src/types'
import { withInstall } from '../../../utils/withInstall'
import TxFlowLight from './src/TxFlowLight.vue'

/**
 * TxFlowLight — the 流光 surface: a fixed light in the Tuff brand colours, laid over a panel. Use
 * it on its own inside any positioned box, or through `flowLight` on TxBaseSurface, TxCard and the
 * anchor family's `panelCard`.
 *
 * @example
 * ```ts
 * import { TxFlowLight } from '@talex-touch/tuffex/flow-light'
 *
 * // <div class="panel"><TxFlowLight variant="rim" /> … </div>
 * ```
 *
 * @public
 */
const FlowLight = withInstall(TxFlowLight)

export { FlowLight, TxFlowLight }
export type { FlowLightProps, FlowLightVariant }
export type TxFlowLightInstance = InstanceType<typeof TxFlowLight>

export default FlowLight
