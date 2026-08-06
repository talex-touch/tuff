import { withInstall } from '../../../utils/withInstall'
import TxToolConfirmation from './src/TxToolConfirmation.vue'

const ToolConfirmation = withInstall(TxToolConfirmation)

export { ToolConfirmation, TxToolConfirmation }
export type TxToolConfirmationInstance = InstanceType<typeof TxToolConfirmation>

export default ToolConfirmation
