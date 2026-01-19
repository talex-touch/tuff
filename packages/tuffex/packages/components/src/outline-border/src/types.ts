export type OutlineShape = 'circle' | 'rect' | 'squircle'

export type OutlineBorderVariant = 'border' | 'ring' | 'ring-offset' | 'ring-inset'

export type OutlineClipMode = 'none' | 'overflow' | 'clipPath' | 'mask'

export type OutlineClipShape = 'auto' | 'circle' | 'rounded' | 'squircle' | 'hexagon'

export interface OutlineBorderProps {
  as?: string
  variant?: OutlineBorderVariant
  shape?: OutlineShape

  borderRadius?: string | number

  borderWidth?: string | number
  borderColor?: string
  borderStyle?: 'solid' | 'dashed' | 'dotted'

  ringWidth?: string | number
  ringColor?: string

  offset?: string | number
  offsetBg?: string

  padding?: string | number

  clipMode?: OutlineClipMode
  clipShape?: OutlineClipShape
}
