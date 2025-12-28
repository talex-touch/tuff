import TxTransition from './src/TxTransition.vue'
import TxTransitionFade from './src/TxTransitionFade.vue'
import TxTransitionSlideFade from './src/TxTransitionSlideFade.vue'
import TxTransitionRebound from './src/TxTransitionRebound.vue'
import TxTransitionSmoothSize from './src/TxTransitionSmoothSize.vue'
import { withInstall } from '../../../utils/withInstall'
import type {
  TransitionPreset,
  TxTransitionProps,
  TxTransitionSmoothSizeProps,
} from './src/types'

const Transition = withInstall(TxTransition)
const TransitionFade = withInstall(TxTransitionFade)
const TransitionSlideFade = withInstall(TxTransitionSlideFade)
const TransitionRebound = withInstall(TxTransitionRebound)
const TransitionSmoothSize = withInstall(TxTransitionSmoothSize)

export {
  Transition,
  TransitionFade,
  TransitionSlideFade,
  TransitionRebound,
  TransitionSmoothSize,
  TxTransition,
  TxTransitionFade,
  TxTransitionSlideFade,
  TxTransitionRebound,
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
