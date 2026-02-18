export type EdgeFadeMaskAxis = 'vertical' | 'horizontal'

export interface EdgeFadeMaskProps {
  as?: string
  axis?: EdgeFadeMaskAxis
  size?: string | number
  threshold?: number
  disabled?: boolean
  observeResize?: boolean
}
