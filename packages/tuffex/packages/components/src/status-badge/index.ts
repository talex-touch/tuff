import TxStatusBadge from './src/TxStatusBadge.vue'
import { withInstall } from '../../../utils/withInstall'
import type { StatusBadgeProps, StatusBadgeEmits, StatusTone, StatusKey, TxOsType } from './src/types'

/**
 * TxStatusBadge component with Vue plugin installation support.
 *
 * @example
 * ```ts
 * import { TxStatusBadge } from '@talex-touch/tuffex'
 *
 * // Use in template
 * <TxStatusBadge text="Approved" status="success" />
 * ```
 *
 * @public
 */
const StatusBadge = withInstall(TxStatusBadge)

export { StatusBadge, TxStatusBadge }
export type { StatusBadgeProps, StatusBadgeEmits, StatusTone, StatusKey, TxOsType }
export type TxStatusBadgeInstance = InstanceType<typeof TxStatusBadge>

export default StatusBadge
