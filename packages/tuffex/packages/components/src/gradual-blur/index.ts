import type { GradualBlurAnimated, GradualBlurCurve, GradualBlurPosition, GradualBlurProps, GradualBlurTarget } from './src/types'
import { withInstall } from '../../../utils/withInstall'
import TxGradualBlur from './src/TxGradualBlur.vue'

const GradualBlur = withInstall(TxGradualBlur)

export { GradualBlur, TxGradualBlur }
export type { GradualBlurAnimated, GradualBlurCurve, GradualBlurPosition, GradualBlurProps, GradualBlurTarget }
export type TxGradualBlurInstance = InstanceType<typeof TxGradualBlur>

export default GradualBlur
