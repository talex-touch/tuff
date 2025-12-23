import { withInstall } from '../../../utils/withInstall'
import TxScrollVue from './src/TxScroll.vue'
import type { TxScrollInfo } from './src/types'
import TouchScrollVue from './src/TouchScroll.vue'

const TxScroll = withInstall(TxScrollVue)
const TouchScroll = withInstall(TouchScrollVue)

export { TxScroll, TouchScroll }
export type { TxScrollInfo }
export default TxScroll
