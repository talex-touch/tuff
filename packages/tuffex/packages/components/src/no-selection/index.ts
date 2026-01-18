import type { NoSelectionProps } from './src/types'
import { withInstall } from '../../../utils/withInstall'
import component from './src/TxNoSelection.vue'

const TxNoSelection = withInstall(component)

export { TxNoSelection }
export type { NoSelectionProps }
export type TxNoSelectionInstance = InstanceType<typeof component>

export default TxNoSelection
