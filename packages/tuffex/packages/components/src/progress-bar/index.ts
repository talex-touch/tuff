import type { ProgressBarEmits, ProgressBarProps } from './src/types'
import { withInstall } from '../../../utils/withInstall'
import TxProgressBar from './src/TxProgressBar.vue'

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
export type { ProgressBarEmits, ProgressBarProps }
export type TxProgressBarInstance = InstanceType<typeof TxProgressBar>

export default ProgressBar
