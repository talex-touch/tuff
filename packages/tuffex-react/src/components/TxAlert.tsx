import type { HTMLAttributes, ReactNode } from 'react'
import { forwardRef } from 'react'
import { useControllableState } from '../hooks/useControllableState'
import { cn } from '../utils/cn'
import { BuiltinIcon } from '../utils/icons'

export type TxAlertType = 'info' | 'success' | 'warning' | 'error'

export interface TxAlertProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  type?: TxAlertType
  title?: ReactNode
  message?: ReactNode
  closable?: boolean
  showIcon?: boolean
  closeLabel?: string
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
  onClose?: () => void
}

const ICON_MAP: Record<TxAlertType, string> = {
  success: 'check-circle',
  warning: 'alert-triangle',
  error: 'x-circle',
  info: 'info',
}

export const TxAlert = forwardRef<HTMLDivElement, TxAlertProps>((
  {
    type = 'info',
    title,
    message,
    closable = true,
    showIcon = true,
    closeLabel = 'Close',
    open,
    defaultOpen = true,
    onOpenChange,
    onClose,
    className,
    children,
    ...rest
  },
  ref,
) => {
  const [visible, setVisible] = useControllableState({
    value: open,
    defaultValue: defaultOpen,
    onChange: onOpenChange,
  })

  if (!visible)
    return null

  const handleClose = () => {
    setVisible(false)
    onClose?.()
  }

  return (
    <div
      ref={ref}
      className={cn('tx-alert', `tx-alert--${type}`, { 'tx-alert--closable': closable }, className)}
      role="alert"
      {...rest}
    >
      {showIcon && (
        <div className="tx-alert__icon">
          <BuiltinIcon name={ICON_MAP[type]} />
        </div>
      )}

      <div className="tx-alert__content">
        {title !== undefined && title !== null && title !== '' && (
          <div className="tx-alert__title">{title}</div>
        )}
        <div className="tx-alert__message">{children ?? message}</div>
      </div>

      {closable && (
        <button
          type="button"
          className="tx-alert__close"
          aria-label={closeLabel}
          onClick={handleClose}
        >
          <BuiltinIcon name="close" />
        </button>
      )}
    </div>
  )
})
