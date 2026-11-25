import type {
  ChangeEvent,
  CSSProperties,
  FocusEvent,
  InputHTMLAttributes,
  KeyboardEvent,
  ReactNode,
  TextareaHTMLAttributes,
} from 'react'
import { forwardRef, useRef, useState } from 'react'
import { useControllableState } from '../hooks/useControllableState'
import { cn, mergeRefs } from '../utils/cn'

export type TxInputType = 'text' | 'password' | 'textarea' | 'date' | 'email' | 'number'

export interface TxInputProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'value' | 'defaultValue' | 'onChange' | 'type' | 'prefix' | 'onFocus' | 'onBlur' | 'onKeyDown'
> {
  value?: string | number
  defaultValue?: string | number
  type?: TxInputType
  disabled?: boolean
  readOnly?: boolean
  clearable?: boolean
  invalid?: boolean
  rows?: number
  prefixIcon?: string
  suffixIcon?: string
  prefix?: ReactNode
  suffix?: ReactNode
  capsLockText?: string
  onChange?: (value: string | number) => void
  onInputChange?: (value: string | number) => void
  onClear?: () => void
  onFocus?: (event: FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => void
  onBlur?: (event: FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => void
  onKeyDown?: (event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => void
  wrapperClassName?: string
  wrapperStyle?: CSSProperties
}

export const TxInput = forwardRef<HTMLInputElement | HTMLTextAreaElement, TxInputProps>(function TxInput(
  {
    value,
    defaultValue = '',
    placeholder = '',
    type = 'text',
    disabled = false,
    readOnly = false,
    clearable = false,
    invalid = false,
    rows = 3,
    prefixIcon = '',
    suffixIcon = '',
    prefix,
    suffix,
    capsLockText = 'CapsLock is on',
    onChange,
    onInputChange,
    onClear,
    onFocus,
    onBlur,
    onKeyDown,
    className,
    style,
    wrapperClassName,
    wrapperStyle,
    ...rest
  },
  ref,
) {
  const [currentValue, setCurrentValue] = useControllableState<string | number>({
    value,
    defaultValue,
    onChange,
  })

  const innerRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null)
  const [isFocused, setIsFocused] = useState(false)
  const [capsLockOn, setCapsLockOn] = useState(false)

  const handleChange = (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const raw = event.target.value
    const normalized: string | number = type === 'number'
      ? (raw === '' ? '' : Number(raw))
      : raw
    setCurrentValue(normalized)
    onInputChange?.(normalized)
  }

  const handleClear = () => {
    if (disabled || readOnly)
      return
    setCurrentValue('')
    onInputChange?.('')
    onClear?.()
    innerRef.current?.focus()
  }

  const handleFocus = (event: FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setIsFocused(true)
    onFocus?.(event)
  }

  const handleBlur = (event: FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setIsFocused(false)
    setCapsLockOn(false)
    onBlur?.(event)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (type === 'password' && typeof event.getModifierState === 'function')
      setCapsLockOn(event.getModifierState('CapsLock'))
    onKeyDown?.(event)
  }

  const showClear = clearable && currentValue !== '' && currentValue !== null && currentValue !== undefined && !disabled && !readOnly
  const showCapsLock = type === 'password' && capsLockOn && isFocused

  return (
    <div
      className={cn(
        'tx-input fake-background',
        {
          'is-disabled': disabled,
          'is-readonly': readOnly,
          'is-invalid': invalid,
          'is-textarea': type === 'textarea',
          'is-focused': isFocused,
        },
        className,
        wrapperClassName,
      )}
      style={{ ...style, ...wrapperStyle }}
    >
      {prefix ?? (prefixIcon ? <i className={cn('tx-input__icon tx-input__icon--prefix', prefixIcon)} aria-hidden="true" /> : null)}

      {type === 'textarea'
        ? (
            <textarea
              ref={mergeRefs(ref as React.Ref<HTMLTextAreaElement>, innerRef as React.Ref<HTMLTextAreaElement>)}
              value={String(currentValue ?? '')}
              placeholder={placeholder}
              disabled={disabled}
              readOnly={readOnly}
              rows={rows}
              className="tx-input__inner tx-input__textarea"
              onChange={handleChange}
              onFocus={handleFocus}
              onBlur={handleBlur}
              onKeyDown={handleKeyDown}
              {...(rest as unknown as TextareaHTMLAttributes<HTMLTextAreaElement>)}
            />
          )
        : (
            <input
              ref={mergeRefs(ref as React.Ref<HTMLInputElement>, innerRef as React.Ref<HTMLInputElement>)}
              value={String(currentValue ?? '')}
              type={type}
              placeholder={placeholder}
              disabled={disabled}
              readOnly={readOnly}
              className="tx-input__inner"
              onChange={handleChange}
              onFocus={handleFocus}
              onBlur={handleBlur}
              onKeyDown={handleKeyDown}
              {...rest}
            />
          )}

      {showCapsLock && (
        <span
          className="tx-input__capslock"
          role="status"
          aria-live="polite"
          aria-label={capsLockText}
          title={capsLockText}
        >
          <svg viewBox="0 0 24 24" width="14" height="14">
            <path fill="currentColor" d="M12 2L4 10h3v4h10v-4h3L12 2zm-5 14v2h10v-2H7z" />
          </svg>
        </span>
      )}

      {showClear && (
        <button
          type="button"
          className="tx-input__clear"
          aria-label="Clear input"
          onClick={handleClear}
        >
          <svg viewBox="0 0 24 24" width="16" height="16">
            <path fill="currentColor" d="M12 10.586l4.95-4.95 1.414 1.414-4.95 4.95 4.95 4.95-1.414 1.414-4.95-4.95-4.95 4.95-1.414-1.414 4.95-4.95-4.95-4.95 1.414-1.414z" />
          </svg>
        </button>
      )}

      {suffix ?? (suffixIcon ? <i className={cn('tx-input__icon tx-input__icon--suffix', suffixIcon)} aria-hidden="true" /> : null)}
    </div>
  )
})
