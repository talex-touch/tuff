import TxGradualBlur from './src/TxGradualBlur.vue'
import { withInstall } from '../../../utils/withInstall'
import type { GradualBlurProps } from './src/types'

const GradualBlur = withInstall(TxGradualBlur)

export { GradualBlur, TxGradualBlur }
export type { GradualBlurProps }
export type TxGradualBlurInstance = InstanceType<typeof TxGradualBlur>

export default GradualBlur
