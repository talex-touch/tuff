import { withInstall } from '../../../utils/withInstall'
import TxMotionText from './src/TxMotionText.vue'

const MotionText = withInstall(TxMotionText)
export { MotionText, TxMotionText }
export { MOTION_TEXT_VARIANTS } from './src/presets'
export { MOTION_TEXT_VARIANT_IDS } from './src/types'
export type {
  MotionTextEmits,
  MotionTextExpose,
  MotionTextGroup,
  MotionTextItem,
  MotionTextMediaSlotProps,
  MotionTextProps,
  MotionTextRevealDirection,
  MotionTextSize,
  MotionTextSlots,
  MotionTextTrigger,
  MotionTextVariant,
  MotionTextVariantInfo,
} from './src/types'
export type TxMotionTextInstance = InstanceType<typeof TxMotionText>
export default MotionText
