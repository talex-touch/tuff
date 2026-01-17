import type {
  TransitionPreset,
  TxTransitionProps,
  TxTransitionSmoothSizeProps,
} from './src/types'
import { withInstall } from '../../../utils/withInstall'
import TxTransition from './src/TxTransition.vue'
import TxTransitionFade from './src/TxTransitionFade.vue'
import TxTransitionRebound from './src/TxTransitionRebound.vue'
import TxTransitionSlideFade from './src/TxTransitionSlideFade.vue'
import TxTransitionSmoothSize from './src/TxTransitionSmoothSize.vue'

const Transition = withInstall(TxTransition)
const TransitionFade = withInstall(TxTransitionFade)
const TransitionSlideFade = withInstall(TxTransitionSlideFade)
const TransitionRebound = withInstall(TxTransitionRebound)
const TransitionSmoothSize = withInstall(TxTransitionSmoothSize)

export {
  Transition,
  TransitionFade,
  TransitionRebound,
  TransitionSlideFade,
  TransitionSmoothSize,
  TxTransition,
  TxTransitionFade,
  TxTransitionRebound,
  TxTransitionSlideFade,
  TxTransitionSmoothSize,
}

export type {
  TransitionPreset,
  TxTransitionProps,
  TxTransitionSmoothSizeProps,
}

export type TxTransitionInstance = InstanceType<typeof TxTransition>
export type TxTransitionFadeInstance = InstanceType<typeof TxTransitionFade>
export type TxTransitionSlideFadeInstance = InstanceType<typeof TxTransitionSlideFade>
export type TxTransitionReboundInstance = InstanceType<typeof TxTransitionRebound>
export type TxTransitionSmoothSizeInstance = InstanceType<typeof TxTransitionSmoothSize>

export default Transition
