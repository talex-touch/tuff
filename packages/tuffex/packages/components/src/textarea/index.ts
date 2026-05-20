import { withInstall } from '../../../utils/withInstall'
import component from './src/TxTextarea.vue'

const TxTextarea = withInstall(component)

export { TxTextarea }
export type TxTextareaInstance = InstanceType<typeof component>

export default TxTextarea
