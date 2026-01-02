export type StackDirection = 'horizontal' | 'vertical'

export interface StackProps {
  direction?: StackDirection
  gap?: number | string
  align?: string
  justify?: string
  wrap?: boolean
  inline?: boolean
}
