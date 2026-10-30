import type { Component } from 'vue'

export type TouchSurfaceBase = 'base' | 'glass'

export interface TouchSurfaceProps {
  /**
   * What the touch effect is laid on. `base` is `TxBaseSurface`, `glass` is `TxGlassSurface`, and any
   * other component works too if its root element is the surface. Every other attribute goes to it, so
   * `mode`, `engine`, `width` and the rest of its props are written on `TxTouchSurface` itself.
   * @default 'base'
   */
  surface?: TouchSurfaceBase | Component
  /** Turns the touch effect off; the surface stays as it is drawn. */
  disabled?: boolean
  /** How far it leans toward the pointer, as a share of half its size, with the pointer at its edge. @default 0.1 */
  lean?: number
  /** The most it leans, px. @default 12 */
  maxLean?: number
  /** Lift under a hovering mouse or pen, 0 to 1; a press or a touch is 1. @default 0.3 */
  hoverLift?: number
  /** How much larger a full lift makes it, as a share of its size. @default 0.06 */
  pressGrow?: number
  /** Stretch along an axis per px/s of pointer speed on it, as a share of the size. @default 0.0001 */
  stretch?: number
  /** The most it stretches along one axis, as a share of its size. @default 0.2 */
  maxStretch?: number
  /** How far the width swells per unit of speed while the lift changes. @default 0.016 */
  swell?: number
  /** Spring that eases the lift, the lean and the stretch. @default 150 */
  stiffness?: number
  /** @default 19 */
  damping?: number
}
