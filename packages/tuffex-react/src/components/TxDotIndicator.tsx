import type { CSSProperties, HTMLAttributes } from 'react'
import { forwardRef } from 'react'
import { cn } from '../utils/cn'

export interface TxDotIndicatorProps extends HTMLAttributes<HTMLSpanElement> {
  color?: string
  label?: string
  size?: number
  ariaLabel?: string
}

export const TxDotIndicator = forwardRef<HTMLSpanElement, TxDotIndicatorProps>((
  {
    color = 'currentColor',
    label,
    size = 8,
    ariaLabel,
    className,
    style,
    children,
    ...rest
  },
  ref,
) => {
  const hasLabel = Boolean(label) || (children !== undefined && children !== null && children !== '')

  const dotStyle = {
    '--tx-bui-dot-indicator-color': color,
    '--tx-bui-dot-indicator-size': `${size}px`,
    ...style,
  } as CSSProperties

  return (
    <span
      ref={ref}
      className={cn('tx-bui-dot-indicator', className)}
      role={!hasLabel && ariaLabel ? 'img' : undefined}
      aria-label={!hasLabel && ariaLabel ? ariaLabel : undefined}
      aria-hidden={!hasLabel && !ariaLabel ? true : undefined}
      style={dotStyle}
      {...rest}
    >
      <span className="tx-bui-dot-indicator__dot" aria-hidden="true" />
      {hasLabel && <span className="tx-bui-dot-indicator__label">{children ?? label}</span>}
    </span>
  )
})
