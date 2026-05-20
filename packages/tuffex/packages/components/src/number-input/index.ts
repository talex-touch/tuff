import { withInstall } from '../../../utils/withInstall'
import component from './src/TxNumberInput.vue'

const TxNumberInput = withInstall(component)

export { TxNumberInput }
export type TxNumberInputInstance = InstanceType<typeof component>

export default TxNumberInput
