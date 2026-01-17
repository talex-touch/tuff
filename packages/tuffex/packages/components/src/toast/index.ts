import { withInstall } from '../../../utils/withInstall'
import TxToastHost from './src/TxToastHost.vue'

const ToastHost = withInstall(TxToastHost)

export { ToastHost, TxToastHost }
export type TxToastHostInstance = InstanceType<typeof TxToastHost>

export default ToastHost
