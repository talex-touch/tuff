import type { KbdProps } from './src/types'
import { withInstall } from '../../../utils/withInstall'
import component from './src/TxKbd.vue'

const TxKbd = withInstall(component)

export { TxKbd }
export type { KbdProps }
export type TxKbdInstance = InstanceType<typeof component>

export default TxKbd
