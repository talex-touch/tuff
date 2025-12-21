export type SkeletonVariant = 'text' | 'rect' | 'circle'

export interface SkeletonProps {
  loading?: boolean
  variant?: SkeletonVariant
  width?: string | number
  height?: string | number
  radius?: string | number
  lines?: number
  gap?: string | number
}
