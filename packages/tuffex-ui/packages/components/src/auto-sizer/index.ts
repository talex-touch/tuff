import TxAutoSizer from './src/TxAutoSizer.vue'
import { withInstall } from '../../../utils/withInstall'
import type { AutoSizerProps } from './src/types'

const AutoSizer = withInstall(TxAutoSizer)

export { AutoSizer, TxAutoSizer }
export type { AutoSizerProps }
export type TxAutoSizerInstance = InstanceType<typeof TxAutoSizer>

export default AutoSizer
