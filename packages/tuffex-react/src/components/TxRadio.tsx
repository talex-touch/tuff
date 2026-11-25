import type { ButtonHTMLAttributes, HTMLAttributes, KeyboardEvent, ReactNode } from 'react'
import { createContext, forwardRef, useCallback, useContext, useMemo, useRef } from 'react'
import { useControllableState } from '../hooks/useControllableState'
import { cn, mergeRefs } from '../utils/cn'

export type TxRadioValue = string | number
export type TxRadioType = 'button' | 'standard' | 'card'
export type TxRadioIndicatorVariant = 'solid' | 'outline' | 'glass' | 'blur'

interface RadioGroupContextValue {
  value: TxRadioValue | undefined
  disabled: boolean
  readOnly: boolean
  type: TxRadioType
  selectValue: (value: TxRadioValue) => void
}

const RadioGroupContext = createContext<RadioGroupContextValue | null>(null)

export interface TxRadioGroupProps extends Omit<HTMLAttributes<HTMLDivElement>, 'onChange' | 'defaultValue'> {
  value?: TxRadioValue
  defaultValue?: TxRadioValue
  disabled?: boolean
  readOnly?: boolean
  type?: TxRadioType
  direction?: 'row' | 'column'
  indicatorVariant?: TxRadioIndicatorVariant
  onChange?: (value: TxRadioValue) => void
}

export const TxRadioGroup = forwardRef<HTMLDivElement, TxRadioGroupProps>(function TxRadioGroup(
  {
    value,
    defaultValue,
    disabled = false,
    readOnly = false,
    type = 'button',
    direction,
    indicatorVariant = 'solid',
    onChange,
    onKeyDown,
    className,
    children,
    ...rest
  },
  ref,
) {
  const [selectedValue, setSelectedValue] = useControllableState<TxRadioValue | undefined>({
    value,
    defaultValue,
    onChange: (next) => {
      if (next !== undefined)
        onChange?.(next)
    },
  })

  const groupRef = useRef<HTMLDivElement | null>(null)

  const resolvedDirection = type === 'button'
    ? 'row'
    : type === 'standard'
      ? (direction ?? 'row')
      : (direction ?? 'column')

  const selectValue = useCallback(
    (next: TxRadioValue) => {
      if (disabled || readOnly)
        return
      setSelectedValue(next)
    },
    [disabled, readOnly, setSelectedValue],
  )

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    onKeyDown?.(event)
    if (disabled || readOnly || !groupRef.current)
      return
    const keys = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp']
    if (!keys.includes(event.key))
      return

    const radios = Array.from(
      groupRef.current.querySelectorAll<HTMLButtonElement>('button[role="radio"]:not([disabled])'),
    )
    if (!radios.length)
      return

    const currentIndex = radios.findIndex(el => el === document.activeElement)
    const step = (event.key === 'ArrowRight' || event.key === 'ArrowDown') ? 1 : -1
    const nextIndex = currentIndex === -1
      ? 0
      : (currentIndex + step + radios.length) % radios.length
    const target = radios[nextIndex]
    if (target) {
      event.preventDefault()
      target.focus()
      target.click()
    }
  }

  const ctx = useMemo<RadioGroupContextValue>(
    () => ({
      value: selectedValue,
      disabled,
      readOnly,
      type,
      selectValue,
    }),
    [selectedValue, disabled, readOnly, type, selectValue],
  )

  return (
    <RadioGroupContext.Provider value={ctx}>
      <div
        ref={mergeRefs(ref, groupRef)}
        className={cn(
          'tx-radio-group',
          `tx-radio-group--${type}`,
          `tx-radio-group--dir-${resolvedDirection}`,
          `tx-radio-group--indicator-${indicatorVariant}`,
          className,
        )}
        role="radiogroup"
        aria-disabled={disabled || undefined}
        aria-readonly={readOnly || undefined}
        onKeyDown={handleKeyDown}
        {...rest}
      >
        {children}
      </div>
    </RadioGroupContext.Provider>
  )
})

export interface TxRadioProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'value' | 'onChange' | 'type'> {
  value: TxRadioValue
  disabled?: boolean
  label?: ReactNode
  type?: TxRadioType
  checked?: boolean
  defaultChecked?: boolean
  onChange?: (checked: boolean) => void
  onSelectValue?: (value: TxRadioValue) => void
}

export const TxRadio = forwardRef<HTMLButtonElement, TxRadioProps>(function TxRadio(
  {
    value,
    disabled = false,
    label = '',
    type = 'button',
    checked,
    defaultChecked = false,
    onChange,
    onSelectValue,
    onClick,
    className,
    children,
    ...rest
  },
  ref,
) {
  const group = useContext(RadioGroupContext)
  const [standaloneChecked, setStandaloneChecked] = useControllableState({
    value: checked,
    defaultValue: defaultChecked,
    onChange,
  })

  const isDisabled = (group?.disabled ?? false) || disabled
  const isReadOnly = group?.readOnly ?? false
  const isChecked = group ? group.value === value : standaloneChecked
  const radioType = group?.type ?? type

  const handleClick: ButtonHTMLAttributes<HTMLButtonElement>['onClick'] = (event) => {
    onClick?.(event)
    if (event.defaultPrevented || isDisabled || isReadOnly)
      return
    if (group) {
      if (!isChecked) {
        group.selectValue(value)
        onSelectValue?.(value)
      }
      return
    }
    onSelectValue?.(value)
    if (!isChecked)
      setStandaloneChecked(true)
  }

  const content = children ?? label

  return (
    <button
      ref={ref}
      type="button"
      role="radio"
      aria-checked={isChecked}
      disabled={isDisabled}
      className={cn(
        'tx-radio',
        `tx-radio--${radioType}`,
        {
          'is-checked': isChecked,
          'is-disabled': isDisabled,
          'is-readonly': isReadOnly,
        },
        className,
      )}
      onClick={handleClick}
      {...rest}
    >
      {radioType === 'standard'
        ? (
            <>
              <span className="tx-radio__indicator" aria-hidden="true" />
              <span className="tx-radio__label">{content}</span>
            </>
          )
        : radioType === 'card'
          ? (
              <>
                <span className="tx-radio__indicator" aria-hidden="true" />
                <span className="tx-radio__content">{content}</span>
              </>
            )
          : content}
    </button>
  )
})
