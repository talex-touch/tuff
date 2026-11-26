import type { CSSProperties, HTMLAttributes } from 'react'
import { forwardRef } from 'react'
import { cn } from '../utils/cn'

export interface TxSpinnerProps extends HTMLAttributes<HTMLSpanElement> {
  size?: number
  strokeWidth?: number
  fallback?: boolean
  visible?: boolean
  label?: string
}

export const TxSpinner = forwardRef<HTMLSpanElement, TxSpinnerProps>((
  {
    size = 16,
    strokeWidth = 2,
    fallback = false,
    visible = true,
    label = 'Loading',
    className,
    style,
    ...rest
  },
  ref,
) => {
  if (!visible)
    return null

  const cssVars = {
    '--tx-spinner-size': `${size}px`,
    '--tx-spinner-stroke': String(strokeWidth),
    ...style,
  } as CSSProperties

  return (
    <span
      ref={ref}
      className={cn('tx-spinner', className)}
      style={cssVars}
      role="status"
      aria-busy="true"
      aria-live="polite"
      aria-label={label}
      {...rest}
    >
      {fallback
        ? (
            <svg className="tx-spinner__svg" viewBox="0 0 24 24" width={size} height={size}>
              <circle
                className="tx-spinner__circle"
                cx="12"
                cy="12"
                r="10"
                fill="none"
                stroke="currentColor"
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeDasharray="31.416"
                strokeDashoffset="31.416"
              />
            </svg>
          )
        : (
            <div className="tx-spinner-container">
              <div className="tx-spinner-container-ball" />
              <div className="tx-spinner-container-float" />
            </div>
          )}
    </span>
  )
})
