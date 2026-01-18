import type { PermissionStateProps } from './src/types'
import { withInstall } from '../../../utils/withInstall'
import component from './src/TxPermissionState.vue'

const TxPermissionState = withInstall(component)

export { TxPermissionState }
export type { PermissionStateProps }
export type TxPermissionStateInstance = InstanceType<typeof component>

export default TxPermissionState
