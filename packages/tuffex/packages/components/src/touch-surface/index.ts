import type { TouchSurfaceBase, TouchSurfaceProps } from './src/types'
import { withInstall } from '../../../utils/withInstall'
import TxTouchSurface from './src/TxTouchSurface.vue'

/**
 * TxTouchSurface — any of the surfaces, answering a hovering mouse or a finger like a drop of liquid
 * glass: it lifts, leans toward the pointer, stretches along the way the pointer moves and springs back.
 * `useLiquidTouch` is the same effect for an element of your own.
 *
 * @example
 * ```ts
 * import { TxTouchSurface } from '@talex-touch/tuffex'
 *
 * // <TxTouchSurface surface="glass" engine="lens" :width="210" :height="150" :border-radius="75" />
 * ```
 */
const TouchSurface = withInstall(TxTouchSurface)

export { TouchSurface, TxTouchSurface }
export { useLiquidTouch } from './src/use-liquid-touch'
export type { LiquidTouchOptions, LiquidTouchState } from './src/use-liquid-touch'
export type { TouchSurfaceBase, TouchSurfaceProps }
export type TxTouchSurfaceInstance = InstanceType<typeof TxTouchSurface>

export default TouchSurface
