import { withInstall } from '../../../utils/withInstall'
import component from './src/TxOsIcon.vue'

const TxOsIcon = withInstall(component)

export { TxOsIcon }
export type TxOsIconInstance = InstanceType<typeof component>

export default TxOsIcon
