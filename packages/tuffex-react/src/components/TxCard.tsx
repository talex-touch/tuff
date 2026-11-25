import type { CSSProperties, HTMLAttributes, KeyboardEvent, MouseEvent, ReactNode } from 'react'
import { forwardRef } from 'react'
import { cn } from '../utils/cn'
import { TxSpinner } from './TxSpinner'

export type TxCardVariant = 'solid' | 'dashed' | 'plain'
export type TxCardBackground = 'pure' | 'mask' | 'blur' | 'glass' | 'refraction' | 'acrylic' | 'mica' | 'flat' | 'plain'
export type TxCardShadow = 'none' | 'soft' | 'medium'
export type TxCardSize = 'small' | 'medium' | 'large'

export interface TxCardProps extends Omit<HTMLAttributes<HTMLDivElement>, 'onClick'> {
  variant?: TxCardVariant
  background?: TxCardBackground
  shadow?: TxCardShadow
  size?: TxCardSize
  radius?: number
  padding?: number
  clickable?: boolean
  loading?: boolean
  loadingSpinnerSize?: number
  disabled?: boolean
  cover?: ReactNode
  header?: ReactNode
  footer?: ReactNode
  onClick?: (event: MouseEvent<HTMLDivElement>) => void
}

export const TxCard = forwardRef<HTMLDivElement, TxCardProps>(function TxCard(
  {
    variant = 'solid',
    background = 'refraction',
    shadow = 'none',
    size = 'medium',
    radius,
    padding,
    clickable = false,
    loading = false,
    loadingSpinnerSize = 12,
    disabled = false,
    cover,
    header,
    footer,
    onClick,
    onKeyDown,
    className,
    style,
    children,
    ...rest
  },
  ref,
) {
  const resolvedRadius = typeof radius === 'number' ? radius : 18
  const resolvedPadding = typeof padding === 'number'
    ? padding
    : size === 'small'
      ? 10
      : size === 'large'
        ? 16
        : 12

  const isInteractive = clickable || Boolean(onClick)

  const handleClick = (event: MouseEvent<HTMLDivElement>) => {
    if (disabled || !isInteractive)
      return
    onClick?.(event)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    onKeyDown?.(event)
    if (event.target !== event.currentTarget || disabled || !isInteractive)
      return
    if (event.key !== 'Enter' && event.key !== ' ')
      return
    event.preventDefault()
    onClick?.(event as unknown as MouseEvent<HTMLDivElement>)
  }

  const cardStyle = {
    '--tx-card-radius': `${resolvedRadius}px`,
    '--tx-card-padding': `${resolvedPadding}px`,
    ...style,
  } as CSSProperties

  return (
    <div
      ref={ref}
      className={cn(
        'tx-card',
        `is-${variant}`,
        `is-bg-${background}`,
        `is-shadow-${shadow}`,
        `is-${size}`,
        {
          'is-clickable': isInteractive,
          'is-loading': loading,
          'is-disabled': disabled,
        },
        className,
      )}
      style={cardStyle}
      role={isInteractive ? 'button' : undefined}
      tabIndex={isInteractive && !disabled ? 0 : undefined}
      aria-disabled={isInteractive && disabled ? true : undefined}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      {...rest}
    >
      {cover !== undefined && cover !== null && <div className="tx-card__cover">{cover}</div>}
      {header !== undefined && header !== null && <div className="tx-card__header">{header}</div>}
      <div className="tx-card__body">{children}</div>
      {footer !== undefined && footer !== null && <div className="tx-card__footer">{footer}</div>}
      {loading && (
        <div className="tx-card__loading" aria-hidden="true">
          <TxSpinner size={loadingSpinnerSize} />
        </div>
      )}
    </div>
  )
})
