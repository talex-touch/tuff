import type { DotIndicatorProps } from './src/types'
import { withInstall } from '../../../utils/withInstall'
import component from './src/TxDotIndicator.vue'

const TxDotIndicator = withInstall(component)

export { TxDotIndicator }
export type { DotIndicatorProps }
export type TxDotIndicatorInstance = InstanceType<typeof component>

export default TxDotIndicator
