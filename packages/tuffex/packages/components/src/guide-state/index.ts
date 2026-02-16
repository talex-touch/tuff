import type { GuideStateProps } from './src/types'
import { withInstall } from '../../../utils/withInstall'
import component from './src/TxGuideState.vue'

const TxGuideState = withInstall(component)

export { TxGuideState }
export type { GuideStateProps }
export type TxGuideStateInstance = InstanceType<typeof component>

export default TxGuideState
