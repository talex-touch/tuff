import type { SearchEmptyProps } from './src/types'
import { withInstall } from '../../../utils/withInstall'
import component from './src/TxSearchEmpty.vue'

const TxSearchEmpty = withInstall(component)

export { TxSearchEmpty }
export type { SearchEmptyProps }
export type TxSearchEmptyInstance = InstanceType<typeof component>

export default TxSearchEmpty
