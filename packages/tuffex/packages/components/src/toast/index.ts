import { withInstall } from '../../../utils/withInstall'
import TxToastHost from './src/TxToastHost.vue'

const ToastHost = withInstall(TxToastHost)

export { ToastHost, TxToastHost }
export type { TxToastHostProps, TxToastPosition } from './src/types'
export type TxToastHostInstance = InstanceType<typeof TxToastHost>

export default ToastHost
