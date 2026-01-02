export interface FlexProps {
  direction?: 'row' | 'row-reverse' | 'column' | 'column-reverse'
  gap?: number | string
  align?: string
  justify?: string
  wrap?: 'nowrap' | 'wrap' | 'wrap-reverse'
  inline?: boolean
}
