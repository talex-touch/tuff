import type { ButtonHTMLAttributes, CSSProperties, MouseEvent } from 'react'
import { Children, forwardRef } from 'react'
import { cn } from '../utils/cn'
import { TxSpinner } from './TxSpinner'

export type TxButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success' | 'warning' | 'info' | 'flat' | 'bare'
export type TxButtonSize = 'sm' | 'md' | 'lg'
export type TxButtonType = 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'text'
export type TxButtonStatus = '' | 'success' | 'warning' | 'error'

export interface TxButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type'> {
  variant?: TxButtonVariant
  size?: TxButtonSize
  block?: boolean
  type?: TxButtonType
  plain?: boolean
  dashed?: boolean
  round?: boolean
  circle?: boolean
  loading?: boolean
  loadingVariant?: 'spinner' | 'bar'
  progress?: number
  showProgress?: boolean
  formatProgress?: (percentage: number) => string
  status?: TxButtonStatus
  disabled?: boolean
  border?: boolean
  icon?: string
  nativeType?: 'button' | 'submit' | 'reset'
}

function resolveVariant(variant?: TxButtonVariant, type?: TxButtonType): TxButtonVariant {
  if (variant)
    return variant
  switch (type) {
    case 'primary':
      return 'primary'
    case 'success':
      return 'success'
    case 'warning':
      return 'warning'
    case 'danger':
      return 'danger'
    case 'info':
      return 'info'
    case 'text':
      return 'ghost'
    default:
      return 'secondary'
  }
}

export const TxButton = forwardRef<HTMLButtonElement, TxButtonProps>(function TxButton(
  {
    variant,
    size = 'md',
    block = false,
    type,
    plain = false,
    dashed = false,
    round = false,
    circle = false,
    loading = false,
    loadingVariant = 'spinner',
    progress,
    showProgress = true,
    formatProgress,
    status = '',
    disabled = false,
    border = true,
    icon,
    nativeType = 'button',
    className,
    style,
    children,
    onClick,
    ...rest
  },
  ref,
) {
  const normalizedVariant = resolveVariant(variant, type)
  const normalizedSize: TxButtonSize = size === 'sm' || size === 'lg' ? size : 'md'
  const spinnerSize = normalizedSize === 'sm' ? 14 : normalizedSize === 'lg' ? 18 : 16

  const hasProgress = typeof progress === 'number' && Number.isFinite(progress)
  const clampedProgress = hasProgress ? Math.min(100, Math.max(0, progress)) : 0
  const resolvedStatus: TxButtonStatus = status === 'success' || status === 'warning' || status === 'error' ? status : ''
  const hasStatus = resolvedStatus !== ''
  const progressRatio = hasStatus ? 1 : hasProgress ? clampedProgress / 100 : 0
  const showProgressLayer = hasProgress || hasStatus
  const showProgressValue = hasProgress && showProgress && !hasStatus
  const formattedProgress = formatProgress ? formatProgress(clampedProgress) : `${Math.round(clampedProgress)}%`
  const showLoadingBar = loading && block && loadingVariant === 'bar' && !showProgressLayer
  const isBusy = loading || (hasProgress && !hasStatus && clampedProgress < 100)
  const isInteractiveDisabled = disabled || isBusy

  const hasChildren = Children.toArray(children).some((child) => {
    if (typeof child === 'string')
      return child.trim().length > 0
    return Boolean(child)
  })
  const isIconOnly = !(block && circle) && (circle || (Boolean(icon) && !hasChildren))
  const autoWidthEnabled = !block && !circle

  const buttonStyle = (showProgressLayer
    ? { '--tx-button-progress-scale': `${progressRatio}`, ...style }
    : style) as CSSProperties | undefined

  const innerStyle = { '--tx-button-spinner-size': `${spinnerSize}px` } as CSSProperties

  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (isInteractiveDisabled)
      return
    onClick?.(event)
  }

  return (
    <button
      ref={ref}
      type={nativeType}
      disabled={isInteractiveDisabled}
      aria-busy={isBusy || undefined}
      className={cn(
        'tx-button fake-background isolate',
        `variant-${normalizedVariant}`,
        type ? `tone-${type}` : undefined,
        `tx-size-${normalizedSize}`,
        resolvedStatus ? `is-status-${resolvedStatus}` : undefined,
        {
          'block': block,
          'loading': loading,
          'loading-bar': showLoadingBar,
          'has-progress': hasProgress,
          'has-status': hasStatus,
          'disabled': disabled,
          'plain': plain,
          'dashed': dashed,
          'round': round,
          'circle': circle,
          'borderless': border === false,
          'auto-width': autoWidthEnabled,
        },
        className,
      )}
      style={buttonStyle}
      onClick={handleClick}
      {...rest}
    >
      {showLoadingBar && <span className="tx-button__loading-layer" aria-hidden="true" />}
      {showProgressLayer && (
        <span className="tx-button__progress-track" aria-hidden="true">
          <span className="tx-button__progress-fill" />
        </span>
      )}
      <span className="tx-button__inner" style={innerStyle}>
        {!showLoadingBar && loading && !hasStatus && (
          isIconOnly && !hasProgress
            ? <TxSpinner className="tx-button__spinner is-overlay" visible size={spinnerSize} />
            : (
                <span className="tx-button__spinner-slot is-visible">
                  <TxSpinner className="tx-button__spinner" visible size={spinnerSize} />
                </span>
              )
        )}

        {hasStatus && (
          <span className="tx-button__status-slot is-visible" aria-hidden="true">
            <svg className="tx-button__status-svg" viewBox="0 0 24 24" width={spinnerSize} height={spinnerSize}>
              {resolvedStatus === 'success' && (
                <path className="tx-button__status-glyph is-success" d="M4 12.5l5 5L20 6.5" pathLength={1} />
              )}
              {resolvedStatus === 'warning' && (
                <g className="tx-button__status-glyph is-warning">
                  <path d="M12 3.5L21 19.5H3L12 3.5Z" pathLength={1} />
                  <path className="tx-button__status-detail" d="M12 9.5v4.5" pathLength={1} />
                  <circle className="tx-button__status-dot" cx="12" cy="16.8" r="1" />
                </g>
              )}
              {resolvedStatus === 'error' && (
                <g className="tx-button__status-glyph is-error">
                  <path d="M18 6L6 18" pathLength={1} />
                  <path className="tx-button__status-second" d="M6 6l12 12" pathLength={1} />
                </g>
              )}
            </svg>
          </span>
        )}

        {icon && (!hasStatus || !isIconOnly) && <i className={cn('tx-button__icon', icon)} aria-hidden="true" />}
        {block && typeof children === 'string'
          ? <span className="tx-button__label">{children}</span>
          : children}

        {showProgressValue && (
          <span className="tx-button__progress-value">{formattedProgress}</span>
        )}
      </span>
    </button>
  )
})
