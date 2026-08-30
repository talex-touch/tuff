import type { ChartLegendItemProps, ChartLegendItemVariant } from './src/types'
import { withInstall } from '../utils/with-install'
import component from './src/TxChartLegendItem.vue'

const TxChartLegendItem = withInstall(component)

export { TxChartLegendItem }
export type { ChartLegendItemProps, ChartLegendItemVariant }
export type TxChartLegendItemInstance = InstanceType<typeof component>

export default TxChartLegendItem
