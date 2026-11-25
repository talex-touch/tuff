import type { HTMLAttributes, ReactNode } from 'react'
import { forwardRef } from 'react'
import { cn } from '../utils/cn'

export interface TxEmptyProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  title?: ReactNode
  description?: ReactNode
  iconClass?: string
  icon?: ReactNode
  action?: ReactNode
  compact?: boolean
}

export const TxEmpty = forwardRef<HTMLDivElement, TxEmptyProps>(function TxEmpty(
  {
    title = 'Nothing here',
    description = '',
    iconClass = 'i-carbon-incomplete',
    icon,
    action,
    compact = false,
    className,
    children,
    ...rest
  },
  ref,
) {
  const size = compact ? 'small' : 'medium'
  const showActions = action !== undefined && action !== null || (children !== undefined && children !== null)

  return (
    <div
      ref={ref}
      className={cn(
        'tx-empty-state',
        'tx-empty-state--layout-vertical',
        'tx-empty-state--align-center',
        `tx-empty-state--size-${size}`,
        'tx-empty-state--variant-empty',
        'tx-empty-state--card',
        className,
      )}
      {...rest}
    >
      {(icon !== undefined || iconClass) && (
        <div className="tx-empty-state__icon" aria-hidden="true">
          {icon ?? (
            <svg viewBox="0 0 64 64" width={compact ? 44 : 56} height={compact ? 44 : 56} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="16" y="28" width="32" height="20" rx="3" />
              <line x1="22" y1="34" x2="42" y2="34" />
              <rect x="14" y="20" width="36" height="8" rx="2" />
            </svg>
          )}
        </div>
      )}

      <div className="tx-empty-state__content">
        {title !== undefined && title !== null && title !== '' && (
          <div className="tx-empty-state__title">{title}</div>
        )}
        {description !== undefined && description !== null && description !== '' && (
          <div className="tx-empty-state__description">{description}</div>
        )}
        {showActions && (
          <div className="tx-empty-state__actions">{action ?? children}</div>
        )}
      </div>
    </div>
  )
})
