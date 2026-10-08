import type {
  TransitionPreset,
  TransitionPushDirection,
  TxTransitionProps,
  TxTransitionPushProps,
  TxTransitionSmoothSizeProps,
} from './src/types'
import { withInstall } from '../../../utils/withInstall'
import TxTransition from './src/TxTransition.vue'
import TxTransitionFade from './src/TxTransitionFade.vue'
import TxTransitionPush from './src/TxTransitionPush.vue'
import TxTransitionRebound from './src/TxTransitionRebound.vue'
import TxTransitionSlideFade from './src/TxTransitionSlideFade.vue'
import TxTransitionSmoothSize from './src/TxTransitionSmoothSize.vue'

const Transition = withInstall(TxTransition)
const TransitionFade = withInstall(TxTransitionFade)
const TransitionSlideFade = withInstall(TxTransitionSlideFade)
const TransitionRebound = withInstall(TxTransitionRebound)
const TransitionSmoothSize = withInstall(TxTransitionSmoothSize)
const TransitionPush = withInstall(TxTransitionPush)

export {
  Transition,
  TransitionFade,
  TransitionPush,
  TransitionRebound,
  TransitionSlideFade,
  TransitionSmoothSize,
  TxTransition,
  TxTransitionFade,
  TxTransitionPush,
  TxTransitionRebound,
  TxTransitionSlideFade,
  TxTransitionSmoothSize,
}

export type {
  TransitionPreset,
  TransitionPushDirection,
  TxTransitionProps,
  TxTransitionPushProps,
  TxTransitionSmoothSizeProps,
}

export type TxTransitionInstance = InstanceType<typeof TxTransition>
export type TxTransitionFadeInstance = InstanceType<typeof TxTransitionFade>
export type TxTransitionSlideFadeInstance = InstanceType<typeof TxTransitionSlideFade>
export type TxTransitionReboundInstance = InstanceType<typeof TxTransitionRebound>
export type TxTransitionSmoothSizeInstance = InstanceType<typeof TxTransitionSmoothSize>
export type TxTransitionPushInstance = InstanceType<typeof TxTransitionPush>

export default Transition
