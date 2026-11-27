export type EdgeFadeMaskAxis = 'vertical' | 'horizontal'

export interface EdgeFadeMaskProps {
  as?: string
  axis?: EdgeFadeMaskAxis
  size?: string | number
  threshold?: number
  disabled?: boolean
  observeResize?: boolean
  /**
   * Always apply both leading and trailing edge fades regardless of native
   * scroll overflow metrics (for transformed or virtualized viewports such as
   * `TxPicker`). When `false` (default), fades follow native scroll boundaries.
   */
  always?: boolean
}
