import type { TxScrollInfo } from './src/types'
import { withInstall } from '../../../utils/withInstall'
import TxScrollVue from './src/TxScroll.vue'

const TxScroll = withInstall(TxScrollVue)

export { TxScroll }
export type { TxScrollInfo }
export default TxScroll
