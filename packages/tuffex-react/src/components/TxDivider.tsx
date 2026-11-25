import type { HTMLAttributes } from 'react'
import { forwardRef } from 'react'
import { cn } from '../utils/cn'

export type TxDividerGradient = boolean | 'start' | 'end' | 'both'

export interface TxDividerProps extends HTMLAttributes<HTMLDivElement> {
  direction?: 'horizontal' | 'vertical'
  dashed?: boolean
  textPlacement?: 'left' | 'center' | 'right'
  gradient?: TxDividerGradient
}

export const TxDivider = forwardRef<HTMLDivElement, TxDividerProps>(function TxDivider(
  {
    direction = 'horizontal',
    dashed = false,
    textPlacement = 'center',
    gradient = false,
    className,
    children,
    ...rest
  },
  ref,
) {
  const gradientMode = gradient === true
    ? 'both'
    : (gradient === 'start' || gradient === 'end' || gradient === 'both')
        ? gradient
        : null

  return (
    <div
      ref={ref}
      className={cn(
        'tx-divider',
        `tx-divider--${direction}`,
        `tx-divider--text-${textPlacement}`,
        gradientMode ? `tx-divider--gradient-${gradientMode}` : undefined,
        {
          'tx-divider--dashed': dashed,
          'tx-divider--gradient': Boolean(gradientMode),
        },
        className,
      )}
      role="separator"
      aria-orientation={direction}
      {...rest}
    >
      {direction === 'horizontal' && children !== undefined && children !== null && (
        <span className="tx-divider__text">{children}</span>
      )}
    </div>
  )
})
