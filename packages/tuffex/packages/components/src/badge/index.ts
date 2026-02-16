import type { BadgeProps, BadgeVariant } from './src/types'
import { withInstall } from '../../../utils/withInstall'
import component from './src/TxBadge.vue'

const TxBadge = withInstall(component)

export { TxBadge }
export type { BadgeProps, BadgeVariant }
export type TxBadgeInstance = InstanceType<typeof component>

export default TxBadge
