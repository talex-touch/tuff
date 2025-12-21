import TxTooltip from './src/TxTooltip.vue'
import { withInstall } from '../../../utils/withInstall'
import type { TooltipProps } from './src/types'

const Tooltip = withInstall(TxTooltip)

export { Tooltip, TxTooltip }
export type { TooltipProps }
export type TxTooltipInstance = InstanceType<typeof TxTooltip>

export default Tooltip
