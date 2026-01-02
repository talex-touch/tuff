import TxSplitter from './src/TxSplitter.vue'
import { withInstall } from '../../../utils/withInstall'
import type { SplitterEmits, SplitterProps } from './src/types'

const Splitter = withInstall(TxSplitter)

export { Splitter, TxSplitter }
export type { SplitterEmits, SplitterProps }
export type TxSplitterInstance = InstanceType<typeof TxSplitter>

export default Splitter
