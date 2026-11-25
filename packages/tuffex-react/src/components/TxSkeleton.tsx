import type { CSSProperties, HTMLAttributes } from 'react'
import { forwardRef } from 'react'
import { cn, toCssUnit } from '../utils/cn'

export type TxSkeletonVariant = 'text' | 'rect' | 'circle'

export interface TxSkeletonProps extends HTMLAttributes<HTMLDivElement> {
  loading?: boolean
  variant?: TxSkeletonVariant
  width?: string | number
  height?: string | number
  radius?: string | number
  lines?: number
  gap?: string | number
}

export const TxSkeleton = forwardRef<HTMLDivElement, TxSkeletonProps>(function TxSkeleton(
  {
    loading = true,
    variant = 'text',
    width = '100%',
    height = 12,
    radius = 8,
    lines = 1,
    gap = 10,
    className,
    style,
    children,
    ...rest
  },
  ref,
) {
  if (!loading)
    return <>{children}</>

  const itemStyle = {
    '--tx-skeleton-width': toCssUnit(width, '100%'),
    '--tx-skeleton-height': toCssUnit(height, '12px'),
    '--tx-skeleton-radius': variant === 'circle' ? '999px' : toCssUnit(radius, '8px'),
  } as CSSProperties

  const rootStyle = {
    '--tx-skeleton-gap': toCssUnit(gap, '10px'),
    ...style,
  } as CSSProperties

  const count = Math.max(1, lines)

  return (
    <div
      ref={ref}
      className={cn('tx-skeleton', className)}
      style={rootStyle}
      aria-hidden="true"
      {...rest}
    >
      {Array.from({ length: count }).map((_, index) => (
        <div
          key={index}
          className={cn('tx-skeleton__item', `tx-skeleton__item--${variant}`)}
          style={itemStyle}
        />
      ))}
    </div>
  )
})
