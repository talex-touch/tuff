import { withInstall } from '../../../utils/withInstall'
import component from './src/TxIconButton.vue'

const TxIconButton = withInstall(component)

export { TxIconButton }
export type TxIconButtonInstance = InstanceType<typeof component>

export default TxIconButton
