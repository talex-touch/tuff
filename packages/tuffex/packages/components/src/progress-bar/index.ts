import TxProgressBar from './src/TxProgressBar.vue'
import { withInstall } from '../../../utils/withInstall'
import type { ProgressBarProps, ProgressBarEmits } from './src/types'

/**
 * TxProgressBar component with Vue plugin installation support.
 *
 * @example
 * ```ts
 * import { TxProgressBar } from '@talex-touch/tuffex'
 *
 * // Use in template
 * <TxProgressBar loading />
 * <TxProgressBar :percentage="50" show-text />
 * ```
 *
 * @public
 */
const ProgressBar = withInstall(TxProgressBar)

export { ProgressBar, TxProgressBar }
export type { ProgressBarProps, ProgressBarEmits }
export type TxProgressBarInstance = InstanceType<typeof TxProgressBar>

export default ProgressBar
