import type { StatusBadgeEmits, StatusBadgeProps, StatusKey, StatusTone, TxOsType } from './src/types'
import { withInstall } from '../../../utils/withInstall'
import TxStatusBadge from './src/TxStatusBadge.vue'

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
export type { StatusBadgeEmits, StatusBadgeProps, StatusKey, StatusTone, TxOsType }
export type TxStatusBadgeInstance = InstanceType<typeof TxStatusBadge>

export default StatusBadge
