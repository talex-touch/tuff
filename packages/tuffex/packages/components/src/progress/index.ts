import type { ProgressProps } from './src/types'
import { withInstall } from '../../../utils/withInstall'
import TuffProgress from './src/TxProgress.vue'

withInstall(TuffProgress)

export { TuffProgress }
export type { ProgressProps }
export type TuffProgressInstance = InstanceType<typeof TuffProgress>
export default TuffProgress
