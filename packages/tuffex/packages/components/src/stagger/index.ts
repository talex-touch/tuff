import TxStagger from './src/TxStagger.vue'
import { withInstall } from '../../../utils/withInstall'
import type { StaggerProps } from './src/types'

const Stagger = withInstall(TxStagger)

export { Stagger, TxStagger }
export type { StaggerProps }
export type TxStaggerInstance = InstanceType<typeof TxStagger>

export default Stagger
