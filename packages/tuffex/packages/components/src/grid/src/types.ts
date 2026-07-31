export type Breakpoint = 'xs' | 'sm' | 'md' | 'lg' | 'xl'

export type Responsive<T> = Partial<Record<Breakpoint, T>>

export type GridAlign = 'start' | 'end' | 'center' | 'stretch'

export type GridGap =
  | number
  | string
  | { row?: number | string, col?: number | string }
  | Responsive<number | string>

export interface GridProps {
  cols?: number | Responsive<number>
  rows?: number
  gap?: GridGap
  minItemWidth?: string
  justify?: GridAlign
  align?: GridAlign
}

export interface GridItemProps {
  colSpan?: number
  rowSpan?: number
  justifySelf?: GridAlign
  alignSelf?: GridAlign
}
