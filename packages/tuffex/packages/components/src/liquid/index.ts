import { withInstall } from '../../../utils/withInstall'
import TxLiquid from './src/TxLiquid.vue'
import TxLiquidItem from './src/TxLiquidItem.vue'

const Liquid = withInstall(TxLiquid)
const LiquidItem = withInstall(TxLiquidItem)

export { Liquid, LiquidItem, TxLiquid, TxLiquidItem }

export type { CornerRadii } from './src/geometry'
export { EVOLVE_DEFAULTS, MOVE_DEFAULTS } from './src/observer'
export type { EvolveOptions, MoveOptions } from './src/observer'
// `resolveTransition` compiles a preset or a raw spring into `{ duration, easing }` (a CSS
// `linear()` curve), for callers that play the library's springs through WAAPI or CSS.
export { presets as liquidTransitionPresets, resolveTransition } from './src/spring'
// `Transition`/`TransitionPreset` clash with the transition component in the
// star barrel (export * silently drops duplicated names) — alias them.
export type {
  ResolvedTransition,
  SpringConfig,
  Transition as LiquidTransition,
  TransitionPreset as LiquidTransitionPreset,
} from './src/spring'
export type {
  DissolveOptions,
  LiquidEffect,
  LiquidItemProps,
  LiquidProps,
  MorphTuning,
  MoveTuning,
} from './src/types'
export type TxLiquidInstance = InstanceType<typeof TxLiquid>
export type TxLiquidItemInstance = InstanceType<typeof TxLiquidItem>

export default Liquid
