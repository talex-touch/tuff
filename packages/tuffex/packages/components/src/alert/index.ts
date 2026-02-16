import type { AlertEmits, AlertProps, AlertType } from './src/types'
import { withInstall } from '../../../utils/withInstall'
import component from './src/TxAlert.vue'

const TxAlert = withInstall(component)

export { TxAlert }
export type { AlertEmits, AlertProps, AlertType }
export type TxAlertInstance = InstanceType<typeof component>

export default TxAlert
