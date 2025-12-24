import type { AutoResizeRounding } from '../../../../utils/animation/auto-resize'

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
}
