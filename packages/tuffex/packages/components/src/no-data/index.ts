import type { NoDataProps } from './src/types'
import { withInstall } from '../../../utils/withInstall'
import component from './src/TxNoData.vue'

const TxNoData = withInstall(component)

export { TxNoData }
export type { NoDataProps }
export type TxNoDataInstance = InstanceType<typeof component>

export default TxNoData
