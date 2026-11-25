import type { HTMLAttributes, ReactNode } from 'react'
import type { TxStatusTone } from './TxStatusBadge'
import { forwardRef, useEffect, useRef, useState } from 'react'
import { cn } from '../utils/cn'
import { BuiltinIcon } from '../utils/icons'

export type TxStatusHintSize = 'sm' | 'md'

export interface TxStatusHintProps extends HTMLAttributes<HTMLDivElement> {
  text?: string | number
  tone?: TxStatusTone
  size?: TxStatusHintSize
  pulseKey?: string | number
  animated?: boolean
  live?: boolean
  icon?: ReactNode
}

const GLYPHS: Partial<Record<TxStatusTone, string>> = {
  success: 'check-circle',
  warning: 'alert-triangle',
  danger: 'x-circle',
  info: 'info',
}

export const TxStatusHint = forwardRef<HTMLDivElement, TxStatusHintProps>((
  {
    text = '',
    tone = 'success',
    size = 'md',
    pulseKey,
    animated = true,
    live = true,
    icon,
    className,
    children,
    ...rest
  },
  ref,
) => {
  const [pulse, setPulse] = useState<0 | 1 | 2>(0)
  const mountedRef = useRef(false)

  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true
      return
    }
    if (animated)
      setPulse(prev => (prev === 1 ? 2 : 1))
  }, [text, pulseKey, animated])

  const glyph = GLYPHS[tone] ?? ''
  const showIcon = Boolean(icon) || Boolean(glyph)

  return (
    <div
      ref={ref}
      className={cn(
        'tx-status-hint',
        `tx-status-hint--${size}`,
        `is-${tone}`,
        {
          'is-animated': animated,
          'is-pulse-a': pulse === 1,
          'is-pulse-b': pulse === 2,
        },
        className,
      )}
      {...rest}
    >
      <span className="tx-status-hint__wash" aria-hidden="true" />
      {showIcon && (
        <span className="tx-status-hint__icon" aria-hidden="true">
          {icon ?? <BuiltinIcon name={glyph} />}
        </span>
      )}
      <span
        className="tx-status-hint__text"
        role={live ? 'status' : undefined}
        aria-live={live ? 'polite' : 'off'}
      >
        {children ?? text}
      </span>
    </div>
  )
})
