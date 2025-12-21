import TxToastHost from './src/TxToastHost.vue'
import { withInstall } from '../../../utils/withInstall'

const ToastHost = withInstall(TxToastHost)

export { ToastHost, TxToastHost }
export type TxToastHostInstance = InstanceType<typeof TxToastHost>

export default ToastHost
