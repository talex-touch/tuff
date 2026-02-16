import type { ErrorStateProps } from './src/types'
import { withInstall } from '../../../utils/withInstall'
import component from './src/TxErrorState.vue'

const TxErrorState = withInstall(component)

export { TxErrorState }
export type { ErrorStateProps }
export type TxErrorStateInstance = InstanceType<typeof component>

export default TxErrorState
