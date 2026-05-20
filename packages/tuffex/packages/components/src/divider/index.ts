import { withInstall } from '../../../utils/withInstall'
import component from './src/TxDivider.vue'

const TxDivider = withInstall(component)

export { TxDivider }
export type TxDividerInstance = InstanceType<typeof component>

export default TxDivider
