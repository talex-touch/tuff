import type { WorkingIndicatorProps, WorkingIndicatorVariant } from './src/types'
import { withInstall } from '../../../utils/withInstall'
import component from './src/TxWorkingIndicator.vue'

const TxWorkingIndicator = withInstall(component)

export { TxWorkingIndicator }
export { formatElapsed, useElapsed } from './src/use-elapsed'
export type { UseElapsedOptions } from './src/use-elapsed'
export type { WorkingIndicatorProps, WorkingIndicatorVariant }
export type TxWorkingIndicatorInstance = InstanceType<typeof component>

export default TxWorkingIndicator
