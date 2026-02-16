import type { BasePopoverPlacement, BasePopoverProps } from './src/types'
import { withInstall } from '../../../utils/withInstall'
import TxBasePopover from './src/TxBasePopover.vue'

const BasePopover = withInstall(TxBasePopover)

export { BasePopover, TxBasePopover }
export type { BasePopoverPlacement, BasePopoverProps }
export type TxBasePopoverInstance = InstanceType<typeof TxBasePopover>

export default BasePopover
