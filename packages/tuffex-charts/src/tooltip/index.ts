import type { ChartTooltipProps, TooltipRow } from './src/types'
import { withInstall } from '../utils/with-install'
import component from './src/TxChartTooltip.vue'

const TxChartTooltip = withInstall(component)

export { TxChartTooltip }
export { placeTooltip } from './src/position'
export type { TooltipPlacement, TooltipPlacementInput } from './src/position'
export type { ChartTooltipProps, TooltipRow }
export type TxChartTooltipInstance = InstanceType<typeof component>

export default TxChartTooltip
