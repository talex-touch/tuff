import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { forwardRef, useId } from 'react'
import { useControllableState } from '../hooks/useControllableState'
import { cn } from '../utils/cn'

export interface TxCheckboxProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onChange'> {
  checked?: boolean
  defaultChecked?: boolean
  disabled?: boolean
  loading?: boolean
  readOnly?: boolean
  label?: ReactNode
  labelPlacement?: 'start' | 'end'
  variant?: 'fill' | 'checkmark'
  ariaLabel?: string
  indeterminate?: boolean
  onChange?: (checked: boolean) => void
}

export const TxCheckbox = forwardRef<HTMLButtonElement, TxCheckboxProps>((
  {
    checked,
    defaultChecked = false,
    disabled = false,
    loading = false,
    readOnly = false,
    label,
    labelPlacement = 'end',
    variant = 'checkmark',
    ariaLabel,
    indeterminate = false,
    onChange,
    onClick,
    className,
    children,
    ...rest
  },
  ref,
) => {
  const [isChecked, setIsChecked] = useControllableState({
    value: checked,
    defaultValue: defaultChecked,
    onChange,
  })

  const labelId = useId()
  const labelContent = children ?? label
  const hasLabel = labelContent !== undefined && labelContent !== null && labelContent !== ''
  const isBlocked = disabled || loading

  const handleClick: ButtonHTMLAttributes<HTMLButtonElement>['onClick'] = (event) => {
    onClick?.(event)
    if (event.defaultPrevented || isBlocked || readOnly)
      return
    setIsChecked(indeterminate ? true : !isChecked)
  }

  return (
    <button
      ref={ref}
      type="button"
      role="checkbox"
      aria-checked={indeterminate ? 'mixed' : isChecked}
      aria-disabled={isBlocked}
      aria-readonly={readOnly || undefined}
      aria-busy={loading || undefined}
      aria-label={hasLabel ? undefined : ariaLabel}
      aria-labelledby={hasLabel ? labelId : undefined}
      disabled={isBlocked}
      className={cn(
        'tx-checkbox',
        `tx-checkbox--${variant}`,
        {
          'is-checked': isChecked,
          'is-indeterminate': indeterminate,
          'is-disabled': disabled,
          'is-loading': loading,
          'is-readonly': readOnly,
        },
        className,
      )}
      onClick={handleClick}
      {...rest}
    >
      {hasLabel && labelPlacement === 'start' && (
        <span id={labelId} className="tx-checkbox__label">{labelContent}</span>
      )}

      <span className="tx-checkbox__box" aria-hidden="true">
        {indeterminate && <span className="tx-checkbox__dash" />}
        {variant !== 'fill' && (
          <svg viewBox="0 0 400 400" xmlns="http://www.w3.org/2000/svg">
            <polyline
              fill="none"
              strokeWidth="24"
              points="88,214 173,284 304,138"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="tx-checkbox__tick"
            />
          </svg>
        )}
      </span>

      {hasLabel && labelPlacement === 'end' && (
        <span id={labelId} className="tx-checkbox__label">{labelContent}</span>
      )}
    </button>
  )
})
