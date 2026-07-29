import type { TooltipAnchorProps, TooltipProps } from './src/types'
import { withInstall } from '../../../utils/withInstall'
import TxTooltip from './src/TxTooltip.vue'

const Tooltip = withInstall(TxTooltip)

export { Tooltip, TxTooltip }
export type { TooltipAnchorProps, TooltipProps }
export type TxTooltipInstance = InstanceType<typeof TxTooltip>

export default Tooltip
