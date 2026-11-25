import type { CSSProperties, HTMLAttributes } from 'react'
import { forwardRef, useEffect, useRef, useState } from 'react'
import { cn } from '../utils/cn'

export type TxBadgeVariant = 'default' | 'primary' | 'success' | 'warning' | 'error'

export interface TxBadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: TxBadgeVariant
  value?: number | string
  color?: string
  dot?: boolean
  open?: boolean
}

export const TxBadge = forwardRef<HTMLSpanElement, TxBadgeProps>(function TxBadge(
  {
    variant = 'default',
    value = 0,
    color,
    dot = false,
    open = true,
    className,
    style,
    children,
    ...rest
  },
  ref,
) {
  const initialOpenRef = useRef(open)
  const [hasToggled, setHasToggled] = useState(false)

  useEffect(() => {
    if (open !== initialOpenRef.current)
      setHasToggled(true)
  }, [open])

  const hasChildren = children !== undefined && children !== null && children !== ''
  const isNumeric = typeof value === 'number' && !hasChildren

  const badgeStyle = (color
    ? {
        '--tx-badge-bg': color,
        '--tx-badge-text': '#ffffff',
        '--tx-badge-dot': color,
        ...style,
      }
    : style) as CSSProperties | undefined

  return (
    <span
      ref={ref}
      className={cn(
        'tx-badge',
        `tx-badge--${variant}`,
        {
          'tx-badge--numeric': isNumeric && !dot,
          'tx-badge--dot': dot,
          'is-open': open && hasToggled,
          'is-closed': !open,
        },
        className,
      )}
      style={badgeStyle}
      {...rest}
    >
      {dot
        ? <span className="tx-badge__dot" />
        : hasChildren
          ? children
          : typeof value === 'number'
            ? <span className="tx-badge__number">{value}</span>
            : value}
    </span>
  )
})
