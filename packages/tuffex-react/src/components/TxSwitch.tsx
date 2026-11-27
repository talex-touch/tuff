import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { forwardRef, useId } from 'react'
import { useControllableState } from '../hooks/useControllableState'
import { cn } from '../utils/cn'

export interface TxSwitchProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onChange'> {
  checked?: boolean
  defaultChecked?: boolean
  disabled?: boolean
  loading?: boolean
  readOnly?: boolean
  size?: 'small' | 'default' | 'large'
  label?: ReactNode
  labelPlacement?: 'start' | 'end'
  ariaLabel?: string
  ariaLabelledby?: string
  onChange?: (checked: boolean) => void
}

export const TxSwitch = forwardRef<HTMLButtonElement, TxSwitchProps>((
  {
    checked,
    defaultChecked = false,
    disabled = false,
    loading = false,
    readOnly = false,
    size = 'default',
    label,
    labelPlacement = 'end',
    ariaLabel = 'Toggle',
    ariaLabelledby,
    onChange,
    onClick,
    className,
    children,
    ...rest
  },
  ref,
) => {
  const [isActive, setIsActive] = useControllableState({
    value: checked,
    defaultValue: defaultChecked,
    onChange,
  })

  const labelId = useId()
  const labelContent = children ?? label
  const hasLabel = labelContent !== undefined && labelContent !== null && labelContent !== ''
  const isBlocked = disabled || loading

  const effectiveAriaLabel = ariaLabelledby || hasLabel ? undefined : ariaLabel

  const handleClick: ButtonHTMLAttributes<HTMLButtonElement>['onClick'] = (event) => {
    onClick?.(event)
    if (event.defaultPrevented || isBlocked || readOnly)
      return
    setIsActive(!isActive)
  }

  return (
    <button
      ref={ref}
      type="button"
      role="switch"
      aria-checked={isActive}
      aria-disabled={isBlocked}
      aria-readonly={readOnly || undefined}
      aria-busy={loading || undefined}
      aria-label={effectiveAriaLabel}
      aria-labelledby={ariaLabelledby ?? (hasLabel ? labelId : undefined)}
      disabled={isBlocked}
      className={cn(
        'tuff-switch',
        {
          'is-active': isActive,
          'is-disabled': disabled,
          'is-loading': loading,
          'is-readonly': readOnly,
          'has-label': hasLabel,
          [`tuff-switch--${size}`]: size !== 'default',
        },
        className,
      )}
      onClick={handleClick}
      {...rest}
    >
      {hasLabel && labelPlacement === 'start' && (
        <span id={labelId} className="tuff-switch__label">{labelContent}</span>
      )}

      <span className="tuff-switch__track">
        <span className="tuff-switch__thumb" />
      </span>

      {hasLabel && labelPlacement === 'end' && (
        <span id={labelId} className="tuff-switch__label">{labelContent}</span>
      )}
    </button>
  )
})
