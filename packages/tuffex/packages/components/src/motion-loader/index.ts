import { withInstall } from '../../../utils/withInstall'
import TxMotionLoader from './src/TxMotionLoader.vue'

const MotionLoader = withInstall(TxMotionLoader)

export { MotionLoader, TxMotionLoader }
export { MOTION_LOADER_SOURCES } from './src/scenes'
export { MOTION_LOADER_VARIANTS } from './src/types'
export type {
  MotionLoaderLabels,
  MotionLoaderProps,
  MotionLoaderSize,
  MotionLoaderSource,
  MotionLoaderVariant,
} from './src/types'
export type TxMotionLoaderInstance = InstanceType<typeof TxMotionLoader>
export default MotionLoader
