import type { StaggerEasing, StaggerProps } from './src/types'
import { withInstall } from '../../../utils/withInstall'
import TxStagger from './src/TxStagger.vue'

const Stagger = withInstall(TxStagger)

export { Stagger, TxStagger }
export type { StaggerEasing, StaggerProps }
export type TxStaggerInstance = InstanceType<typeof TxStagger>

export default Stagger
