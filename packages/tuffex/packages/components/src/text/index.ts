import type { TxTextOverflow, TxTextProps, TxTextScroll } from './src/types'
import { withInstall } from '../../../utils/withInstall'
import component from './src/TxText.vue'

const TxText = withInstall(component)

export { TxText }
export type { TxTextOverflow, TxTextProps, TxTextScroll }
export type TxTextInstance = InstanceType<typeof component>

export default TxText
