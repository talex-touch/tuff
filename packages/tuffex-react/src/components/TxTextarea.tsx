import type { ChangeEvent, FocusEvent, TextareaHTMLAttributes } from 'react'
import { forwardRef, useState } from 'react'
import { useControllableState } from '../hooks/useControllableState'
import { cn } from '../utils/cn'

export type TxTextareaResize = 'none' | 'vertical' | 'horizontal' | 'both'
export type TxTextareaStatus = 'default' | 'success' | 'error'

export interface TxTextareaProps extends Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  'value' | 'defaultValue' | 'onChange'
> {
  value?: string
  defaultValue?: string
  rows?: number
  disabled?: boolean
  readOnly?: boolean
  maxLength?: number
  showCount?: boolean
  resize?: TxTextareaResize
  status?: TxTextareaStatus
  onChange?: (value: string) => void
}

export const TxTextarea = forwardRef<HTMLTextAreaElement, TxTextareaProps>(function TxTextarea(
  {
    value,
    defaultValue = '',
    placeholder = '',
    rows = 4,
    disabled = false,
    readOnly = false,
    maxLength,
    showCount = false,
    resize = 'vertical',
    status = 'default',
    onChange,
    onFocus,
    onBlur,
    className,
    style,
    ...rest
  },
  ref,
) {
  const [currentValue, setCurrentValue] = useControllableState<string>({
    value,
    defaultValue,
    onChange,
  })
  const [isFocused, setIsFocused] = useState(false)

  const handleChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    setCurrentValue(event.target.value)
  }

  const handleFocus = (event: FocusEvent<HTMLTextAreaElement>) => {
    setIsFocused(true)
    onFocus?.(event)
  }

  const handleBlur = (event: FocusEvent<HTMLTextAreaElement>) => {
    setIsFocused(false)
    onBlur?.(event)
  }

  const countText = maxLength ? `${currentValue.length}/${maxLength}` : `${currentValue.length}`

  return (
    <label
      className={cn(
        'tx-textarea',
        `tx-textarea--${status}`,
        `tx-textarea--resize-${resize}`,
        {
          'is-disabled': disabled,
          'is-readonly': readOnly,
          'is-focused': isFocused,
          'has-counter': showCount,
        },
        className,
      )}
      style={style}
    >
      <textarea
        ref={ref}
        value={currentValue}
        placeholder={placeholder}
        rows={rows}
        disabled={disabled}
        readOnly={readOnly}
        maxLength={maxLength}
        className="tx-textarea__field"
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        {...rest}
      />
      {showCount && (
        <span className="tx-textarea__count" aria-hidden="true">
          {countText}
        </span>
      )}
    </label>
  )
})
