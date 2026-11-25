import type { CSSProperties, HTMLAttributes, KeyboardEvent, MouseEvent } from 'react'
import { forwardRef } from 'react'
import { cn } from '../utils/cn'

export type TxTagVariant = 'outline' | 'soft' | 'plain'

export interface TxTagProps extends Omit<HTMLAttributes<HTMLSpanElement>, 'onClick'> {
  label?: string | null
  icon?: string
  color?: string
  background?: string
  border?: string
  size?: 'sm' | 'md'
  pill?: boolean
  variant?: TxTagVariant
  dot?: string
  dotSize?: number
  count?: number
  closable?: boolean
  closeAriaLabel?: string
  disabled?: boolean
  onClose?: () => void
  onClick?: (event: MouseEvent<HTMLSpanElement>) => void
}

const VARIANT_MIX = {
  outline: { bg: 12, border: 32, text: 100 },
  soft: { bg: 20, border: 34, text: 92 },
  plain: { bg: 0, border: 0, text: 100 },
} as const

export const TxTag = forwardRef<HTMLSpanElement, TxTagProps>((
  {
    label = '',
    icon = '',
    color = 'var(--tx-color-primary)',
    background = '',
    border = '',
    size = 'sm',
    pill = false,
    variant = 'outline',
    dot,
    dotSize = 6,
    count,
    closable = false,
    closeAriaLabel = 'Remove tag',
    disabled = false,
    onClose,
    onClick,
    onKeyDown,
    className,
    style,
    children,
    ...rest
  },
  ref,
) => {
  const safeColor = color || 'var(--tx-color-primary)'
  const mix = VARIANT_MIX[variant]

  const resolvedBg = background || (
    variant === 'plain'
      ? 'var(--tx-fill-color-light, #f5f7fa)'
      : `color-mix(in srgb, ${safeColor} ${mix.bg}%, transparent)`
  )
  const resolvedBorder = border || (
    variant === 'plain'
      ? 'var(--tx-border-color-light, #e4e7ed)'
      : `color-mix(in srgb, ${safeColor} ${mix.border}%, transparent)`
  )
  const resolvedText = variant === 'plain'
    ? 'var(--tx-text-color-secondary, #909399)'
    : mix.text >= 100
      ? safeColor
      : `color-mix(in srgb, ${safeColor} ${mix.text}%, var(--tx-text-color-primary, #303133))`

  const styleVars = {
    '--tx-tag-color': safeColor,
    '--tx-tag-bg': resolvedBg,
    '--tx-tag-border': resolvedBorder,
    '--tx-tag-text': resolvedText,
    '--tx-tag-dot-size': `${dotSize}px`,
    ...style,
  } as CSSProperties

  const interactive = Boolean(onClick)

  const handleClick = (event: MouseEvent<HTMLSpanElement>) => {
    if (disabled)
      return
    onClick?.(event)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLSpanElement>) => {
    onKeyDown?.(event)
    if (event.target !== event.currentTarget || !interactive || disabled)
      return
    if (event.key !== 'Enter' && event.key !== ' ')
      return
    event.preventDefault()
    onClick?.(event as unknown as MouseEvent<HTMLSpanElement>)
  }

  const handleClose = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    if (disabled)
      return
    onClose?.()
  }

  return (
    <span
      ref={ref}
      className={cn(
        'tx-tag',
        `tx-tag--${size}`,
        `tx-tag--${variant}`,
        {
          pill,
          'tx-tag--closable': closable,
          'tx-tag--disabled': disabled,
        },
        className,
      )}
      style={styleVars}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive && !disabled ? 0 : undefined}
      aria-disabled={interactive && disabled ? true : undefined}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      {...rest}
    >
      {dot && <span className="tx-tag__dot" aria-hidden="true" style={{ background: dot }} />}
      {icon && <i className={cn('tx-tag__icon', icon)} aria-hidden="true" />}
      <span className="tx-tag__content">{children ?? label ?? ''}</span>
      {count !== undefined && <span className="tx-tag__count">{count}</span>}
      {closable && (
        <button
          type="button"
          className="tx-tag__close"
          disabled={disabled}
          aria-label={closeAriaLabel}
          onClick={handleClose}
        >
          <svg
            viewBox="0 0 24 24"
            width="12"
            height="12"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      )}
    </span>
  )
})
