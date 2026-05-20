import { withInstall } from '../../../utils/withInstall'
import component from './src/TxCopyButton.vue'

const TxCopyButton = withInstall(component)

export { TxCopyButton }
export type TxCopyButtonInstance = InstanceType<typeof component>

export default TxCopyButton
