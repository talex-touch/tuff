import type { GradualBlurProps } from './src/types'
import { withInstall } from '../../../utils/withInstall'
import TxGradualBlur from './src/TxGradualBlur.vue'

const GradualBlur = withInstall(TxGradualBlur)

export { GradualBlur, TxGradualBlur }
export type { GradualBlurProps }
export type TxGradualBlurInstance = InstanceType<typeof TxGradualBlur>

export default GradualBlur
