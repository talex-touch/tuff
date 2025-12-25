import TxAutoSizer from './src/TxAutoSizer.vue'
import { withInstall } from '../../../utils/withInstall'
import type {
  AutoSizerActionResult,
  AutoSizerActionTarget,
  AutoSizerActionOptions,
  AutoSizerDetect,
  AutoSizerObserveTarget,
  AutoSizerProps,
  AutoSizerSnapshot,
  AutoSizerWatchKey,
} from './src/types'

const AutoSizer = withInstall(TxAutoSizer)

export { AutoSizer, TxAutoSizer }
export type {
  AutoSizerActionOptions,
  AutoSizerActionResult,
  AutoSizerActionTarget,
  AutoSizerDetect,
  AutoSizerObserveTarget,
  AutoSizerProps,
  AutoSizerSnapshot,
  AutoSizerWatchKey,
}
export type TxAutoSizerInstance = InstanceType<typeof TxAutoSizer>

export default AutoSizer
