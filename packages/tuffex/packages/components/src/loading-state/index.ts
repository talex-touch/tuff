import type { LoadingStateEmits, LoadingStateProps } from './src/types'
import { withInstall } from '../../../utils/withInstall'
import component from './src/TxLoadingState.vue'

const TxLoadingState = withInstall(component)

export { TxLoadingState }
export type { LoadingStateEmits, LoadingStateProps }
export type TxLoadingStateInstance = InstanceType<typeof component>

export default TxLoadingState
