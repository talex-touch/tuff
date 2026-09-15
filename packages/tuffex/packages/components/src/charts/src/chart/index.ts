import type { ChartProps } from './src/types'
import { withInstall } from '../utils/with-install'
import component from './src/TxChart.vue'

const TxChart = withInstall(component)

export { TxChart }
export type { ChartProps }
export type TxChartInstance = InstanceType<typeof component>

export default TxChart
