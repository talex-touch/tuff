import type { HTMLAttributes, ReactNode } from 'react'
import type { TxButtonProps } from '../TxButton'
import type { TxIconSource } from './primitives'
import { forwardRef } from 'react'
import { cn } from '../../utils/cn'
import { TxButton } from '../TxButton'
import { TxSpinner } from '../TxSpinner'
import { TxIcon } from './primitives'

export type TxEmptyStateVariant
  = | 'empty'
    | 'blank-slate'
    | 'no-data'
    | 'no-selection'
    | 'search-empty'
    | 'loading'
    | 'offline'
    | 'permission'
    | 'error'
    | 'guide'
    | 'custom'

export type TxEmptyStateLayout = 'vertical' | 'horizontal'
export type TxEmptyStateAlign = 'start' | 'center' | 'end'
export type TxEmptyStateSize = 'small' | 'medium' | 'large'
export type TxEmptyStateSurface = 'plain' | 'card'

export interface TxEmptyStateAction {
  label: string
  type?: TxButtonProps['type']
  variant?: TxButtonProps['variant']
  size?: TxButtonProps['size']
  disabled?: boolean
  icon?: string
}

export interface TxEmptyStateProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  variant?: TxEmptyStateVariant
  title?: ReactNode
  description?: ReactNode
  icon?: TxIconSource | string | ReactNode | null
  iconSize?: number
  layout?: TxEmptyStateLayout
  align?: TxEmptyStateAlign
  size?: TxEmptyStateSize
  surface?: TxEmptyStateSurface
  primaryAction?: TxEmptyStateAction
  secondaryAction?: TxEmptyStateAction
  actionSize?: TxButtonProps['size']
  actions?: ReactNode
  loading?: boolean
  onPrimary?: () => void
  onSecondary?: () => void
}

const VARIANT_DEFAULTS: Record<TxEmptyStateVariant, { title: string, description: string, icon?: string }> = {
  'empty': {
    title: 'Nothing here',
    description: 'There is nothing to show yet.',
    icon: 'i-carbon-incomplete',
  },
  'blank-slate': {
    title: 'Start from scratch',
    description: 'Create your first item to get started.',
    icon: '',
  },
  'no-data': {
    title: 'No data',
    description: 'No data available yet.',
    icon: 'i-carbon-data-base',
  },
  'no-selection': {
    title: 'Nothing selected',
    description: 'Select an item to see details.',
    icon: 'i-carbon-view',
  },
  'search-empty': {
    title: 'No results',
    description: 'Try a different keyword or filter.',
    icon: 'i-carbon-search',
  },
  'loading': {
    title: 'Loading',
    description: 'Please wait a moment.',
    icon: '',
  },
  'offline': {
    title: 'You are offline',
    description: 'Check your connection and retry.',
    icon: 'i-carbon-cloud-offline',
  },
  'permission': {
    title: 'Access denied',
    description: 'You do not have permission to view this content.',
    icon: 'i-carbon-locked',
  },
  'error': {
    title: 'Something went wrong',
    description: 'Please try again later.',
    icon: 'i-carbon-warning',
  },
  'guide': {
    title: 'Start here',
    description: 'Follow the steps to get started.',
    icon: 'i-carbon-direction-straight-right',
  },
  'custom': {
    title: '',
    description: '',
    icon: '',
  },
}

const ILLUSTRATION_VARIANTS = new Set<TxEmptyStateVariant>([
  'empty',
  'blank-slate',
  'loading',
  'offline',
  'permission',
  'search-empty',
  'no-data',
  'no-selection',
  'guide',
  'error',
])

const SIZE_MAP: Record<TxEmptyStateSize, number> = {
  small: 28,
  medium: 36,
  large: 44,
}

function isIconSource(val: unknown): val is TxIconSource {
  return typeof val === 'object' && val !== null && 'type' in val && 'value' in val
}

function StateIllustration({ variant }: { variant: TxEmptyStateVariant }) {
  if (variant === 'loading') {
    return (
      <div className="tx-empty-state__loading">
        <div className="tx-empty-state__loading-row">
          <div className="tx-empty-state__skeleton-block tx-empty-state__loading-avatar" />
          <div className="tx-empty-state__loading-lines">
            <div className="tx-empty-state__skeleton-block tx-empty-state__loading-line tx-empty-state__loading-line--wide" />
            <div className="tx-empty-state__skeleton-block tx-empty-state__loading-line tx-empty-state__loading-line--short" />
          </div>
        </div>
        <div className="tx-empty-state__loading-row tx-empty-state__loading-row--muted">
          <div className="tx-empty-state__skeleton-block tx-empty-state__loading-avatar" />
          <div className="tx-empty-state__loading-lines">
            <div className="tx-empty-state__skeleton-block tx-empty-state__loading-line tx-empty-state__loading-line--wide" />
            <div className="tx-empty-state__skeleton-block tx-empty-state__loading-line tx-empty-state__loading-line--short" />
          </div>
        </div>
      </div>
    )
  }

  if (variant === 'no-selection') {
    return (
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <rect className="tx-empty-state__selection-bg-item" x="10" y="8" width="28" height="3" rx="1.5" />
        <g className="tx-empty-state__selection-target">
          <rect className="tx-empty-state__selection-item-bg" x="10" y="16" width="36" height="12" rx="3" />
          <circle className="tx-empty-state__selection-item-icon" cx="18" cy="22" r="3" />
          <rect className="tx-empty-state__selection-item-text" x="24" y="20" width="16" height="4" rx="2" />
        </g>
        <g opacity="0.5">
          <rect className="tx-empty-state__selection-item-bg-muted" x="10" y="34" width="36" height="12" rx="3" />
          <circle className="tx-empty-state__selection-item-icon" cx="18" cy="40" r="3" />
          <rect className="tx-empty-state__selection-item-text" x="24" y="38" width="12" height="4" rx="2" />
        </g>
        <g className="tx-empty-state__selection-cursor">
          <path d="M40 38l-8-8v12.5l3-2.5 2.2 4.2 2.4-1.2-2.2-4.2L40 38z" />
        </g>
      </svg>
    )
  }

  if (variant === 'search-empty') {
    return (
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <g className="tx-empty-state__search-group">
          <circle className="tx-empty-state__search-glass-bg" cx="28" cy="28" r="14" />
          <circle className="tx-empty-state__search-glass-border" cx="28" cy="28" r="14" />
          <line className="tx-empty-state__search-handle" x1="38" y1="38" x2="52" y2="52" />
        </g>
        <g className="tx-empty-state__search-bubble">
          <rect x="30" y="8" width="14" height="18" rx="4" className="tx-empty-state__search-bubble-bg" />
          <text x="37" y="21" fontSize="14" fontWeight="bold" textAnchor="middle" className="tx-empty-state__search-question">?</text>
        </g>
      </svg>
    )
  }

  if (variant === 'no-data') {
    return (
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <line className="tx-empty-state__chart-axis" x1="8" y1="56" x2="56" y2="56" />
        <line className="tx-empty-state__chart-axis" x1="8" y1="12" x2="8" y2="56" />
        <line className="tx-empty-state__chart-grid" x1="8" y1="34" x2="56" y2="34" />
        <line className="tx-empty-state__chart-grid" x1="8" y1="23" x2="56" y2="23" />
        <path className="tx-empty-state__chart-line" d="M8 46 L18 46 L22 38 L26 50 L30 42 L34 46 L56 46" />
        <circle className="tx-empty-state__chart-dot" cx="56" cy="46" r="2.5" />
        <g className="tx-empty-state__chart-marks" transform="translate(42, 28)">
          <path d="M-3 -3 L3 3 M3 -3 L-3 3" strokeWidth="2" strokeLinecap="round" />
        </g>
        <g className="tx-empty-state__chart-marks" transform="translate(22, 22)">
          <path d="M-2 -2 L2 2 M2 -2 L-2 2" strokeWidth="1.5" strokeLinecap="round" />
        </g>
      </svg>
    )
  }

  if (variant === 'offline') {
    return (
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <g className="tx-empty-state__offline-cloud">
          <path className="tx-empty-state__offline-wave tx-empty-state__offline-wave--1" d="M20 36c7-7 17-7 24 0" />
          <path className="tx-empty-state__offline-wave tx-empty-state__offline-wave--2" d="M14 30c10-10 26-10 36 0" />
          <path className="tx-empty-state__offline-wave tx-empty-state__offline-wave--3" d="M26 42c4-4 8-4 12 0" />
          <circle className="tx-empty-state__offline-dot" cx="32" cy="48" r="2.5" />
        </g>
        <line className="tx-empty-state__offline-slash" x1="16" y1="52" x2="48" y2="16" />
      </svg>
    )
  }

  if (variant === 'permission') {
    return (
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <g className="tx-empty-state__lock">
          <path className="tx-empty-state__lock-shackle" d="M24 28v-6a8 8 0 0 1 16 0v6" />
          <rect className="tx-empty-state__lock-body" x="20" y="28" width="24" height="18" rx="4" />
          <circle className="tx-empty-state__lock-keyhole" cx="32" cy="37" r="2.5" />
          <rect className="tx-empty-state__lock-keyhole-line" x="31" y="38" width="2" height="4" />
        </g>
      </svg>
    )
  }

  if (variant === 'blank-slate') {
    return (
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <path className="tx-empty-state__sheet" d="M18 10h18l12 12v30a4 4 0 0 1-4 4H18a4 4 0 0 1-4-4V14a4 4 0 0 1 4-4z" />
        <path className="tx-empty-state__sheet-corner" d="M36 10v8a4 4 0 0 0 4 4h8" />
        <circle className="tx-empty-state__sheet-plus-bg" cx="48" cy="48" r="10" />
        <path className="tx-empty-state__sheet-plus-icon" d="M48 43v10m-5-5h10" />
      </svg>
    )
  }

  if (variant === 'guide') {
    return (
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <g className="tx-empty-state__guide-wrapper">
          <circle className="tx-empty-state__guide-circle" cx="32" cy="20" r="10" />
          <path className="tx-empty-state__guide-arrow" d="M32 26V14M27 19l5-5 5 5" />
        </g>
        <rect className="tx-empty-state__guide-bar" x="20" y="40" width="24" height="4" rx="2" />
        <rect className="tx-empty-state__guide-progress" x="20" y="40" width="12" height="4" rx="2" />
      </svg>
    )
  }

  if (variant === 'error') {
    return (
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <rect className="tx-empty-state__error-window" x="6" y="12" width="44" height="32" rx="6" />
        <path className="tx-empty-state__error-titlebar" d="M6 20h44" />
        <circle className="tx-empty-state__error-light" cx="12" cy="16" r="1.25" />
        <circle className="tx-empty-state__error-light" cx="16.5" cy="16" r="1.25" />
        <circle className="tx-empty-state__error-light" cx="21" cy="16" r="1.25" />
        <path className="tx-empty-state__error-content" d="M13 28h20M13 35h12" />
        <circle className="tx-empty-state__error-pulse" cx="48" cy="46" r="10" />
        <circle className="tx-empty-state__error-pulse tx-empty-state__error-pulse--late" cx="48" cy="46" r="10" />
        <circle className="tx-empty-state__error-badge" cx="48" cy="46" r="10" />
        <path className="tx-empty-state__error-mark" d="M48 41v5.5" />
        <circle className="tx-empty-state__error-dot" cx="48" cy="50.5" r="1.4" />
      </svg>
    )
  }

  // Default: 'empty'
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <g transform="translate(0, 4)">
        <rect className="tx-empty-state__box-body" x="18" y="30" width="28" height="16" rx="2" />
        <line className="tx-empty-state__box-opening" x1="22" y1="34" x2="42" y2="34" />
        <rect className="tx-empty-state__box-lid" x="16" y="22" width="32" height="8" rx="2" />
        <circle className="tx-empty-state__box-dust tx-empty-state__box-dust--1" cx="28" cy="26" r="1.5" />
        <circle className="tx-empty-state__box-dust tx-empty-state__box-dust--2" cx="36" cy="24" r="1" />
        <circle className="tx-empty-state__box-dust tx-empty-state__box-dust--3" cx="32" cy="22" r="1.2" />
      </g>
    </svg>
  )
}

export const TxEmptyState = forwardRef<HTMLDivElement, TxEmptyStateProps>((
  {
    variant = 'empty',
    title,
    description,
    icon,
    iconSize,
    layout = 'vertical',
    align = 'center',
    size = 'medium',
    surface = 'plain',
    primaryAction,
    secondaryAction,
    actionSize = 'sm',
    actions,
    loading = false,
    onPrimary,
    onSecondary,
    className,
    children,
    ...rest
  },
  ref,
) => {
  const defaults = VARIANT_DEFAULTS[variant] ?? VARIANT_DEFAULTS.empty
  const resolvedTitle = title !== undefined ? title : defaults.title
  const resolvedDescription = description !== undefined ? description : defaults.description
  const resolvedIconSize = iconSize ?? SIZE_MAP[size]

  const hasCustomIcon = icon !== undefined && icon !== null && (typeof icon !== 'string' || icon.trim().length > 0)
  const showSpinner = loading && !hasCustomIcon
  const useIllustration = icon !== null && !hasCustomIcon && !showSpinner && ILLUSTRATION_VARIANTS.has(variant)
  const showIcon = icon !== null && (hasCustomIcon || showSpinner || useIllustration)

  const resolvedActions = actions ?? children
  const showActions = Boolean(resolvedActions || primaryAction || secondaryAction)

  const renderIconContent = () => {
    if (showSpinner)
      return <TxSpinner size={resolvedIconSize} />
    if (useIllustration) {
      return (
        <span className="tx-empty-state__illustration" data-variant={variant}>
          <StateIllustration variant={variant} />
        </span>
      )
    }
    if (typeof icon === 'string')
      return <TxIcon name={icon} size={resolvedIconSize} />
    if (isIconSource(icon))
      return <TxIcon icon={icon} size={resolvedIconSize} />
    return icon
  }

  return (
    <div
      ref={ref}
      className={cn(
        'tx-empty-state',
        `tx-empty-state--layout-${layout}`,
        `tx-empty-state--align-${align}`,
        `tx-empty-state--size-${size}`,
        `tx-empty-state--variant-${variant}`,
        { 'tx-empty-state--card': surface === 'card' },
        className,
      )}
      role={variant === 'loading' || loading ? 'status' : variant === 'error' ? 'alert' : undefined}
      aria-busy={variant === 'loading' || loading ? true : undefined}
      {...rest}
    >
      {showIcon && (
        <div className="tx-empty-state__icon" aria-hidden="true">
          {renderIconContent()}
        </div>
      )}

      <div className="tx-empty-state__content">
        {resolvedTitle !== undefined && resolvedTitle !== null && resolvedTitle !== '' && (
          <div className="tx-empty-state__title">{resolvedTitle}</div>
        )}
        {resolvedDescription !== undefined && resolvedDescription !== null && resolvedDescription !== '' && (
          <div className="tx-empty-state__description">{resolvedDescription}</div>
        )}
        {showActions && (
          <div className="tx-empty-state__actions">
            {resolvedActions ?? (
              <>
                {secondaryAction && (
                  <TxButton
                    variant={secondaryAction.variant}
                    type={secondaryAction.type}
                    size={secondaryAction.size ?? actionSize}
                    disabled={secondaryAction.disabled}
                    icon={secondaryAction.icon}
                    onClick={() => onSecondary?.()}
                  >
                    {secondaryAction.label}
                  </TxButton>
                )}
                {primaryAction && (
                  <TxButton
                    variant={primaryAction.variant ?? 'primary'}
                    type={primaryAction.type}
                    size={primaryAction.size ?? actionSize}
                    disabled={primaryAction.disabled}
                    icon={primaryAction.icon}
                    onClick={() => onPrimary?.()}
                  >
                    {primaryAction.label}
                  </TxButton>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
})
TxEmptyState.displayName = 'TxEmptyState'

// ============================================================================
// 9 Specialized State Surface Wrappers
// ============================================================================

export type TxBlankSlateProps = Omit<TxEmptyStateProps, 'variant'>
export const TxBlankSlate = forwardRef<HTMLDivElement, TxBlankSlateProps>((props, ref) => (
  <TxEmptyState ref={ref} size="large" layout="vertical" surface="plain" {...props} variant="blank-slate" />
))
TxBlankSlate.displayName = 'TxBlankSlate'

export type TxErrorStateProps = Omit<TxEmptyStateProps, 'variant'>
export const TxErrorState = forwardRef<HTMLDivElement, TxErrorStateProps>((props, ref) => (
  <TxEmptyState ref={ref} {...props} variant="error" />
))
TxErrorState.displayName = 'TxErrorState'

export type TxGuideStateProps = Omit<TxEmptyStateProps, 'variant'>
export const TxGuideState = forwardRef<HTMLDivElement, TxGuideStateProps>((props, ref) => (
  <TxEmptyState ref={ref} {...props} variant="guide" />
))
TxGuideState.displayName = 'TxGuideState'

export type TxLoadingStateProps = Omit<TxEmptyStateProps, 'variant'>
export const TxLoadingState = forwardRef<HTMLDivElement, TxLoadingStateProps>((props, ref) => (
  <TxEmptyState ref={ref} {...props} variant="loading" />
))
TxLoadingState.displayName = 'TxLoadingState'

export type TxNoDataProps = Omit<TxEmptyStateProps, 'variant'>
export const TxNoData = forwardRef<HTMLDivElement, TxNoDataProps>((props, ref) => (
  <TxEmptyState ref={ref} {...props} variant="no-data" />
))
TxNoData.displayName = 'TxNoData'

export type TxNoSelectionProps = Omit<TxEmptyStateProps, 'variant'>
export const TxNoSelection = forwardRef<HTMLDivElement, TxNoSelectionProps>((props, ref) => (
  <TxEmptyState ref={ref} {...props} variant="no-selection" />
))
TxNoSelection.displayName = 'TxNoSelection'

export type TxOfflineStateProps = Omit<TxEmptyStateProps, 'variant'>
export const TxOfflineState = forwardRef<HTMLDivElement, TxOfflineStateProps>((props, ref) => (
  <TxEmptyState ref={ref} {...props} variant="offline" />
))
TxOfflineState.displayName = 'TxOfflineState'

export type TxPermissionStateProps = Omit<TxEmptyStateProps, 'variant'>
export const TxPermissionState = forwardRef<HTMLDivElement, TxPermissionStateProps>((props, ref) => (
  <TxEmptyState ref={ref} {...props} variant="permission" />
))
TxPermissionState.displayName = 'TxPermissionState'

export type TxSearchEmptyProps = Omit<TxEmptyStateProps, 'variant'>
export const TxSearchEmpty = forwardRef<HTMLDivElement, TxSearchEmptyProps>((props, ref) => (
  <TxEmptyState ref={ref} {...props} variant="search-empty" />
))
TxSearchEmpty.displayName = 'TxSearchEmpty'
