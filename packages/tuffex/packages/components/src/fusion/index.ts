import TxFusion from './src/TxFusion.vue'
import { withInstall } from '../../../utils/withInstall'
import type { FusionDirection, FusionProps, FusionTrigger } from './src/types'

const Fusion = withInstall(TxFusion)

export { Fusion, TxFusion }
export type { FusionDirection, FusionProps, FusionTrigger }
export type TxFusionInstance = InstanceType<typeof TxFusion>

export default Fusion
