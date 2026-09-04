import type { AxisPosition, AxisProps } from './src/types'
import { withInstall } from '../utils/with-install'
import component from './src/TxAxis.vue'

const TxAxis = withInstall(component)

export { TxAxis }
export type { AxisPosition, AxisProps }
export type TxAxisInstance = InstanceType<typeof component>

export default TxAxis
