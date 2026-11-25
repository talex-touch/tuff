import type { CSSProperties, HTMLAttributes, KeyboardEvent, MouseEvent } from 'react'
import { forwardRef } from 'react'
import { cn } from '../utils/cn'
import { OsIcon } from '../utils/icons'

export type TxStatusTone = 'success' | 'warning' | 'danger' | 'info' | 'muted'
export type TxStatusKey = 'granted' | 'denied' | 'notDetermined' | 'unsupported' | string
export type TxOsType = 'macos' | 'windows' | 'linux'

export interface TxStatusBadgeProps extends Omit<HTMLAttributes<HTMLDivElement>, 'onClick'> {
  text?: string
  icon?: string
  status?: TxStatusTone
  statusKey?: TxStatusKey
  size?: 'sm' | 'md'
  os?: TxOsType
  osOnly?: boolean
  onClick?: (event: MouseEvent<HTMLDivElement>) => void
}

const TONE_MAP: Record<TxStatusTone, { color: string, icon: string }> = {
  success: { color: 'var(--tx-color-success)', icon: 'i-carbon-checkmark' },
  warning: { color: 'var(--tx-color-warning)', icon: 'i-carbon-time' },
  danger: { color: 'var(--tx-color-danger)', icon: 'i-carbon-close' },
  info: { color: 'var(--tx-color-primary)', icon: 'i-carbon-information' },
  muted: { color: 'var(--tx-text-color-secondary)', icon: '' },
}

function resolveTone(status?: TxStatusTone, statusKey?: TxStatusKey): TxStatusTone {
  if (status)
    return status
  switch (statusKey) {
    case 'granted':
      return 'success'
    case 'denied':
      return 'danger'
    case 'notDetermined':
      return 'warning'
    case 'unsupported':
      return 'muted'
    default:
      return 'info'
  }
}

export const TxStatusBadge = forwardRef<HTMLDivElement, TxStatusBadgeProps>(function TxStatusBadge(
  {
    text = '',
    icon = '',
    status,
    statusKey = '',
    size = 'md',
    os,
    osOnly = false,
    onClick,
    onKeyDown,
    className,
    style,
    children,
    ...rest
  },
  ref,
) {
  const tone = resolveTone(status, statusKey)
  const meta = TONE_MAP[tone]
  const iconClass = icon || meta.icon
  const hollow = tone === 'muted' && !icon
  const showOsIcon = os === 'macos' || os === 'windows' || os === 'linux'
  const hasChip = !osOnly && (Boolean(iconClass) || hollow)
  const hasIcon = showOsIcon || hasChip
  const interactive = Boolean(onClick)

  const badgeStyle = {
    '--tx-status-color': meta.color,
    '--tx-status-bg': `color-mix(in srgb, ${meta.color} 14%, transparent)`,
    '--tx-status-chip': `var(--tx-status-chip-${tone}, ${meta.color})`,
    ...style,
  } as CSSProperties

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    onKeyDown?.(event)
    if (event.target !== event.currentTarget || !interactive)
      return
    if (event.key !== 'Enter' && event.key !== ' ')
      return
    event.preventDefault()
    onClick?.(event as unknown as MouseEvent<HTMLDivElement>)
  }

  return (
    <div
      ref={ref}
      className={cn('tx-status-badge', `tx-status-badge--${size}`, { 'has-icon': hasIcon }, className)}
      style={badgeStyle}
      role={interactive ? 'button' : 'status'}
      tabIndex={interactive ? 0 : undefined}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      {...rest}
    >
      {showOsIcon && os && <OsIcon os={os} className="tx-status-badge__icon" />}
      {hasChip && (
        <span className={cn('tx-status-badge__chip', { 'is-hollow': hollow })} aria-hidden="true">
          {!hollow && <i className={cn('tx-status-badge__glyph', iconClass)} />}
        </span>
      )}
      <span className="tx-status-badge__text">{children ?? text}</span>
    </div>
  )
})
