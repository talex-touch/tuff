import type { FusionDirection, FusionProps, FusionTrigger } from './src/types'
import { withInstall } from '../../../utils/withInstall'
import TxFusion from './src/TxFusion.vue'

const Fusion = withInstall(TxFusion)

export { Fusion, TxFusion }
export type { FusionDirection, FusionProps, FusionTrigger }
export type TxFusionInstance = InstanceType<typeof TxFusion>

export default Fusion
