import type { OfflineStateProps } from './src/types'
import { withInstall } from '../../../utils/withInstall'
import component from './src/TxOfflineState.vue'

const TxOfflineState = withInstall(component)

export { TxOfflineState }
export type { OfflineStateProps }
export type TxOfflineStateInstance = InstanceType<typeof component>

export default TxOfflineState
