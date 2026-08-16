// Adapted from Beautiful UI (https://www.beautifului.dev), © 2026 Shane Levine, MIT.
import { withInstall } from '../../../utils/withInstall'
import TxAllocationBar from './src/TxAllocationBar.vue'

/**
 * TxAllocationBar — a share-of-whole pill: proportional segments, legend chips
 * and an optional detail panel, all driven by one selected key.
 *
 * @example
 * ```ts
 * import { TxAllocationBar } from '@talex-touch/tuffex'
 *
 * // <TxAllocationBar v-model="segment" :segments="segments" detail />
 * ```
 *
 * @public
 */
const AllocationBar = withInstall(TxAllocationBar)

export { AllocationBar, TxAllocationBar }
export type { AllocationBarEmits, AllocationBarProps, AllocationSegment } from './src/types'
export type TxAllocationBarInstance = InstanceType<typeof TxAllocationBar>

export default AllocationBar
