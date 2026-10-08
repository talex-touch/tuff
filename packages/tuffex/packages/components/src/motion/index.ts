import { withInstall } from '../../../utils/withInstall'
import component from './src/TxMotion.vue'
const TxMotion = withInstall(component)
export { TxMotion }
export { MOTION_VARIANTS } from './src/types'
export type { MotionProps, MotionVariant, MotionItem, MotionPointer, StaggerOptions, MotionHapticType, MotionHapticResult } from './src/types'
export { useMousePosition, useScrollProgress, useStagger, useReducedMotion, useScreenSize, useIsMobile, useLoopFlag, useWebHaptics, useCanvasSetup } from './src/composables'
export type TxMotionInstance = InstanceType<typeof component>
export default TxMotion
