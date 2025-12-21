import TxPopover from './src/TxPopover.vue'
import { withInstall } from '../../../utils/withInstall'
import type { PopoverProps } from './src/types'

const Popover = withInstall(TxPopover)

export { Popover, TxPopover }
export type { PopoverProps }
export type TxPopoverInstance = InstanceType<typeof TxPopover>

export default Popover
