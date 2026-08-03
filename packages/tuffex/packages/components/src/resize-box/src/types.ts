export type ResizeBoxSize = number | string

export interface ResizeBoxProps {
  as?: string

  width?: ResizeBoxSize

  height?: ResizeBoxSize

  duration?: number

  easing?: string

  disabled?: boolean

  clip?: boolean
}
