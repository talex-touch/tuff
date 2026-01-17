import type { PopoverProps } from './src/types'
import { withInstall } from '../../../utils/withInstall'
import TxPopover from './src/TxPopover.vue'

const Popover = withInstall(TxPopover)

export { Popover, TxPopover }
export type { PopoverProps }
export type TxPopoverInstance = InstanceType<typeof TxPopover>

export default Popover
