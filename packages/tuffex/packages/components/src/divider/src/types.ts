export type DividerGradient = boolean | 'start' | 'end' | 'both'

export interface DividerProps {
  direction?: 'horizontal' | 'vertical'
  dashed?: boolean
  textPlacement?: 'left' | 'center' | 'right'
  gradient?: DividerGradient
}
