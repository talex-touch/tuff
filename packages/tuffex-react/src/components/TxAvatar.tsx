import type { CSSProperties, HTMLAttributes, KeyboardEvent, MouseEvent } from 'react'
import { forwardRef, useEffect, useState } from 'react'
import { cn } from '../utils/cn'
import { BuiltinIcon } from '../utils/icons'

export type TxAvatarPresetSize = 'small' | 'medium' | 'large' | 'xlarge'
export type TxAvatarSize = TxAvatarPresetSize | number | `${number}` | `${number}px`
export type TxAvatarStatus = 'online' | 'offline' | 'busy' | 'away'
export type TxAvatarShape = 'circle' | 'square' | 'rounded'

export interface TxAvatarProps extends Omit<HTMLAttributes<HTMLDivElement>, 'onClick'> {
  src?: string
  alt?: string
  name?: string
  icon?: string
  size?: TxAvatarSize
  status?: TxAvatarStatus
  shape?: TxAvatarShape
  clickable?: boolean
  backgroundColor?: string
  textColor?: string
  onClick?: (event: MouseEvent<HTMLDivElement>) => void
}

const SIZE_PRESETS = new Set(['small', 'medium', 'large', 'xlarge'])

function resolveNumericSize(size: TxAvatarSize | undefined): number | null {
  if (typeof size === 'number')
    return size > 0 ? size : null
  if (typeof size === 'string') {
    if (SIZE_PRESETS.has(size))
      return null
    const pxMatch = size.match(/^(\d+(?:\.\d+)?)px$/)
    if (pxMatch) {
      const value = Number(pxMatch[1])
      return value > 0 ? value : null
    }
    const value = Number(size)
    if (!Number.isNaN(value) && value > 0)
      return value
  }
  return null
}

function getInitials(name?: string): string {
  const trimmed = name?.trim()
  if (!trimmed)
    return ''
  const words = trimmed.split(/\s+/).filter(Boolean)
  if (!words.length)
    return ''
  const first = words[0]?.charAt(0).toUpperCase() ?? ''
  if (words.length === 1)
    return first
  const last = words[words.length - 1]?.charAt(0).toUpperCase() ?? ''
  return `${first}${last}`
}

export const TxAvatar = forwardRef<HTMLDivElement, TxAvatarProps>(function TxAvatar(
  {
    src,
    alt = '',
    name,
    icon,
    size = 'medium',
    status,
    shape = 'circle',
    clickable = false,
    backgroundColor,
    textColor,
    onClick,
    onKeyDown,
    className,
    style,
    children,
    ...rest
  },
  ref,
) {
  const [imageError, setImageError] = useState(false)

  useEffect(() => {
    setImageError(false)
  }, [src])

  const numericSize = resolveNumericSize(size)
  const sizeClass = typeof size === 'string' && SIZE_PRESETS.has(size) ? `tx-avatar--${size}` : undefined

  const sizeVars: Record<string, string> = {}
  if (numericSize) {
    const statusSize = Math.max(4, Math.round(numericSize * 0.25))
    const fontSize = Math.round(numericSize * 0.25 + 4)
    const statusBorder = Math.max(1, Math.round(statusSize * 0.16 * 2) / 2)
    sizeVars['--tx-avatar-size'] = `${numericSize}px`
    sizeVars['--tx-avatar-font-size'] = `${fontSize}px`
    sizeVars['--tx-avatar-status-size'] = `${statusSize}px`
    sizeVars['--tx-avatar-status-border'] = `${statusBorder}px`
  }

  const avatarStyle = {
    ...sizeVars,
    ...(backgroundColor
      ? {
          '--tx-avatar-bg': backgroundColor,
          '--tx-avatar-text': textColor || '#ffffff',
        }
      : {}),
    ...style,
  } as CSSProperties

  const fallbackText = getInitials(name)
  const isInteractive = clickable || Boolean(onClick)

  const handleClick = (event: MouseEvent<HTMLDivElement>) => {
    if (isInteractive)
      onClick?.(event)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    onKeyDown?.(event)
    if (event.target !== event.currentTarget || !isInteractive)
      return
    if (event.key !== 'Enter' && event.key !== ' ')
      return
    event.preventDefault()
    onClick?.(event as unknown as MouseEvent<HTMLDivElement>)
  }

  return (
    <div
      ref={ref}
      className={cn(
        'tx-avatar',
        sizeClass,
        `tx-avatar--${shape}`,
        { 'tx-avatar--clickable': isInteractive },
        className,
      )}
      style={avatarStyle}
      role={isInteractive ? 'button' : undefined}
      tabIndex={isInteractive ? 0 : undefined}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      {...rest}
    >
      {src && !imageError
        ? (
            <img
              src={src}
              alt={alt}
              className="tx-avatar__image"
              onError={() => setImageError(true)}
            />
          )
        : (
            <div className="tx-avatar__fallback">
              {children !== undefined && children !== null
                ? children
                : icon
                  ? <BuiltinIcon name={icon} className="tx-avatar__icon" />
                  : fallbackText
                    ? <span className="tx-avatar__text">{fallbackText}</span>
                    : <BuiltinIcon name="user" className="tx-avatar__default-icon" />}
            </div>
          )}

      {status && <div className={cn('tx-avatar__status', `tx-avatar__status--${status}`)} />}
    </div>
  )
})
