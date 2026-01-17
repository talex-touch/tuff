import type { EmptyProps } from './src/types'
import { withInstall } from '../../../utils/withInstall'
import TxEmpty from './src/TxEmpty.vue'

const Empty = withInstall(TxEmpty)

export { Empty, TxEmpty }
export type { EmptyProps }
export type TxEmptyInstance = InstanceType<typeof TxEmpty>

export default Empty
