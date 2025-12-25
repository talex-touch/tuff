import type { AutoResizeRounding } from '../../../../utils/animation/auto-resize'

export type AutoSizerWatchKey = 'rect' | 'box' | 'scroll' | 'class' | 'style' | 'attrs'

export type AutoSizerActionTarget = 'inner' | 'outer'

export type AutoSizerObserveTarget = 'inner' | 'outer' | 'both'

export interface AutoSizerSnapshot {
  rect: { width: number; height: number }
  box: { clientWidth: number; clientHeight: number; offsetWidth: number; offsetHeight: number }
  scroll: { scrollWidth: number; scrollHeight: number }
  className: string
  style: string | null
  attrs: Record<string, string | null>
}

export type AutoSizerDetect = (before: AutoSizerSnapshot, after: AutoSizerSnapshot) => any

export interface AutoSizerActionResult {
  changedKeys: string[]
  before: AutoSizerSnapshot
  after: AutoSizerSnapshot
}

export interface AutoSizerActionOptions {
  watch?: AutoSizerWatchKey[]
  detect?: AutoSizerDetect
  target?: AutoSizerActionTarget
}

export interface AutoSizerProps {
  as?: string
  innerAs?: string
  width?: boolean
  height?: boolean
  inline?: boolean
  durationMs?: number
  easing?: string
  outerClass?: string
  innerClass?: string
  rounding?: AutoResizeRounding
  immediate?: boolean
  rafBatch?: boolean
  observeTarget?: AutoSizerObserveTarget
}
