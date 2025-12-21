import TxEmpty from './src/TxEmpty.vue'
import { withInstall } from '../../../utils/withInstall'
import type { EmptyProps } from './src/types'

const Empty = withInstall(TxEmpty)

export { Empty, TxEmpty }
export type { EmptyProps }
export type TxEmptyInstance = InstanceType<typeof TxEmpty>

export default Empty
