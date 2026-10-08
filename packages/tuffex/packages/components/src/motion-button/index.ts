import { withInstall } from '../../../utils/withInstall'
import TxMotionButton from './src/TxMotionButton.vue'

const MotionButton = withInstall(TxMotionButton)
export { MotionButton, TxMotionButton }
export { MOTION_BUTTON_CATALOG, MOTION_BUTTON_PRESETS } from './src/catalog'
export { MOTION_BUTTON_SOURCE_IDS, MOTION_BUTTON_VARIANTS } from './src/types'
export type {
  MotionButtonCatalogEntry,
  MotionButtonEmits,
  MotionButtonInstance,
  MotionButtonItem,
  MotionButtonProps,
  MotionButtonSize,
  MotionButtonSourceId,
  MotionButtonVariant,
} from './src/types'
export type TxMotionButtonInstance = InstanceType<typeof TxMotionButton>
export default MotionButton
