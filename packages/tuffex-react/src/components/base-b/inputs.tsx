import type {
  ChangeEvent,
  CSSProperties,
  FocusEvent,
  HTMLAttributes,
  KeyboardEvent,
  MouseEvent,
  PointerEvent,
  ReactNode,
} from 'react'
import { hasNavigator } from '@talex-touch/tuffex-core'
import { forwardRef, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { useControllableState } from '../../hooks/useControllableState'
import { cn, mergeRefs, toCssUnit } from '../../utils/cn'
import { BuiltinIcon } from '../../utils/icons'
import { TxInput } from '../TxInput'
import { TxTag } from '../TxTag'

// ============================================================================
// 1. TxNumberInput (number-input)
// ============================================================================

export interface TxNumberInputProps extends Omit<
  HTMLAttributes<HTMLDivElement>,
  'defaultValue' | 'onChange' | 'onFocus' | 'onBlur'
> {
  value?: number | null
  defaultValue?: number | null
  min?: number
  max?: number
  step?: number
  precision?: number
  placeholder?: string
  disabled?: boolean
  readOnly?: boolean
  controls?: boolean
  invalid?: boolean
  decreaseLabel?: string
  increaseLabel?: string
  ariaLabel?: string
  onChange?: (value: number | null) => void
  onFocus?: (event: FocusEvent<HTMLInputElement>) => void
  onBlur?: (event: FocusEvent<HTMLInputElement>) => void
}

function clampNumberValue(raw: number, min?: number, max?: number, precision?: number): number {
  let next = raw
  if (min !== undefined && next < min)
    next = min
  if (max !== undefined && next > max)
    next = max
  if (precision !== undefined && Number.isInteger(precision) && precision >= 0) {
    const factor = 10 ** precision
    next = Math.round(next * factor) / factor
  }
  return next
}

export const TxNumberInput = forwardRef<HTMLInputElement, TxNumberInputProps>((
  {
    value,
    defaultValue = null,
    min,
    max,
    step = 1,
    precision,
    placeholder = '',
    disabled = false,
    readOnly = false,
    controls = true,
    invalid = false,
    decreaseLabel = 'Decrease value',
    increaseLabel = 'Increase value',
    ariaLabel,
    onChange,
    onFocus,
    onBlur,
    className,
    style,
    ...rest
  },
  ref,
) => {
  const [currentValue, setCurrentValue] = useControllableState<number | null>({
    value,
    defaultValue,
    onChange,
  })
  const [isFocused, setIsFocused] = useState(false)
  const [rawValue, setRawValue] = useState('')
  const inputRef = useRef<HTMLInputElement | null>(null)
  const latestValueRef = useRef<number | null>(currentValue)
  latestValueRef.current = currentValue

  const displayValue = isFocused
    ? rawValue
    : currentValue === null || currentValue === undefined
      ? ''
      : precision !== undefined
        ? currentValue.toFixed(precision)
        : String(currentValue)

  const canDecrease = !disabled && !readOnly && (min === undefined || (currentValue ?? 0) > min)
  const canIncrease = !disabled && !readOnly && (max === undefined || (currentValue ?? 0) < max)

  const commit = useCallback((next: number | null) => {
    if (next === null || !Number.isFinite(next)) {
      latestValueRef.current = null
      setCurrentValue(null)
      return
    }
    const clamped = clampNumberValue(next, min, max, precision)
    latestValueRef.current = clamped
    setCurrentValue(clamped)
  }, [max, min, precision, setCurrentValue])

  const stepBy = useCallback((delta: number) => {
    if (disabled || readOnly)
      return
    const base = latestValueRef.current ?? (min !== undefined && min > 0 ? min : 0)
    const next = clampNumberValue(base + delta, min, max, precision)
    latestValueRef.current = next
    setCurrentValue(next)
    if (isFocused)
      setRawValue(precision !== undefined ? next.toFixed(precision) : String(next))
  }, [disabled, isFocused, max, min, precision, readOnly, setCurrentValue])

  const handleFocus = (event: FocusEvent<HTMLInputElement>) => {
    setIsFocused(true)
    setRawValue(currentValue === null || currentValue === undefined ? '' : String(currentValue))
    onFocus?.(event)
  }

  const handleBlur = (event: FocusEvent<HTMLInputElement>) => {
    setIsFocused(false)
    const trimmed = rawValue.trim()
    if (trimmed === '' || trimmed === '-' || trimmed === '.' || trimmed === '-.') {
      commit(null)
    }
    else {
      const parsed = Number(trimmed)
      if (Number.isFinite(parsed))
        commit(parsed)
    }
    onBlur?.(event)
  }

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextRaw = event.target.value
    setRawValue(nextRaw)
    const trimmed = nextRaw.trim()
    if (trimmed === '') {
      setCurrentValue(null)
      return
    }
    const parsed = Number(trimmed)
    if (Number.isFinite(parsed) && !trimmed.endsWith('.')) {
      const inRange = (min === undefined || parsed >= min) && (max === undefined || parsed <= max)
      if (inRange)
        setCurrentValue(precision !== undefined ? clampNumberValue(parsed, min, max, precision) : parsed)
    }
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      stepBy(step)
    }
    else if (event.key === 'ArrowDown') {
      event.preventDefault()
      stepBy(-step)
    }
  }

  return (
    <div
      className={cn(
        'tx-number-input',
        {
          'is-focused': isFocused,
          'is-disabled': disabled,
          'is-readonly': readOnly,
          'is-invalid': invalid,
        },
        className,
      )}
      style={style}
      {...rest}
    >
      {controls && (
        <button
          type="button"
          className="tx-number-input__control tx-number-input__control--dec"
          disabled={!canDecrease}
          aria-label={decreaseLabel}
          onClick={() => stepBy(-step)}
        >
          −
        </button>
      )}
      <input
        ref={mergeRefs(ref, inputRef)}
        type="text"
        inputMode="decimal"
        role="spinbutton"
        className="tx-number-input__field"
        value={displayValue}
        placeholder={placeholder}
        disabled={disabled}
        readOnly={readOnly}
        aria-label={ariaLabel}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={currentValue ?? undefined}
        aria-invalid={invalid || undefined}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
      />
      {controls && (
        <button
          type="button"
          className="tx-number-input__control tx-number-input__control--inc"
          disabled={!canIncrease}
          aria-label={increaseLabel}
          onClick={() => stepBy(step)}
        >
          +
        </button>
      )}
    </div>
  )
})
TxNumberInput.displayName = 'TxNumberInput'

// ============================================================================
// 2. TxSearchInput (search-input)
// ============================================================================

export interface TxSearchInputProps extends Omit<
  HTMLAttributes<HTMLDivElement>,
  'defaultValue' | 'onChange' | 'onFocus' | 'onBlur'
> {
  value?: string
  defaultValue?: string
  placeholder?: string
  disabled?: boolean
  clearable?: boolean
  remote?: boolean
  searchDebounce?: number
  ariaLabel?: string
  onChange?: (value: string) => void
  onSearch?: (value: string) => void
  onClear?: () => void
  onFocus?: (event: FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => void
  onBlur?: (event: FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => void
}

export const TxSearchInput = forwardRef<HTMLInputElement, TxSearchInputProps>((
  {
    value,
    defaultValue = '',
    placeholder = 'Search',
    disabled = false,
    clearable = true,
    remote = false,
    searchDebounce = 250,
    ariaLabel,
    onChange,
    onSearch,
    onClear,
    onFocus,
    onBlur,
    className,
    style,
    ...rest
  },
  ref,
) => {
  const [currentValue, setCurrentValue] = useControllableState<string>({
    value,
    defaultValue,
    onChange,
  })
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  useEffect(() => clearTimer, [clearTimer])

  const emitSearch = useCallback((query: string, immediate = false) => {
    clearTimer()
    if (immediate || !remote || searchDebounce <= 0) {
      onSearch?.(query)
      return
    }
    timerRef.current = setTimeout(() => {
      onSearch?.(query)
    }, searchDebounce)
  }, [clearTimer, onSearch, remote, searchDebounce])

  const handleChange = (nextVal: string | number) => {
    const str = String(nextVal)
    setCurrentValue(str)
    emitSearch(str, false)
  }

  const handleClear = () => {
    clearTimer()
    setCurrentValue('')
    onClear?.()
    onSearch?.('')
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (event.key === 'Enter')
      emitSearch(currentValue, true)
  }

  return (
    <div className={cn('tx-search-input', { 'is-disabled': disabled }, className)} style={style} {...rest}>
      <TxInput
        ref={ref}
        value={currentValue}
        placeholder={placeholder}
        disabled={disabled}
        clearable={clearable}
        aria-label={ariaLabel ?? placeholder}
        prefix={<BuiltinIcon name="search" size={14} className="tx-search-input__icon" />}
        onChange={handleChange}
        onClear={handleClear}
        onFocus={onFocus}
        onBlur={onBlur}
        onKeyDown={handleKeyDown}
      />
    </div>
  )
})
TxSearchInput.displayName = 'TxSearchInput'

// ============================================================================
// 3. TxSensitiveInput (sensitive-input)
// ============================================================================

export type TxSensitiveInputSize = 'xs' | 'sm' | 'md' | 'lg'
export type TxSensitiveInputStatus = 'default' | 'error'

export interface TxSensitiveInputLabels {
  reveal: string
  copy: string
  copied: string
  hide: string
  show: string
  hidden: string
  masked: string
  copySuccess: string
  instruction: string
  fallbackName: string
}

export const TX_SENSITIVE_INPUT_DEFAULT_LABELS: TxSensitiveInputLabels = {
  reveal: 'Click to reveal',
  copy: 'Copy',
  copied: 'Copied',
  hide: 'Hide value',
  show: 'Show value',
  hidden: 'Value hidden',
  masked: 'masked',
  copySuccess: 'Copied to clipboard',
  instruction: 'Press Enter or Space to reveal the value.',
  fallbackName: 'Sensitive value',
}

export interface TxSensitiveInputProps extends Omit<
  HTMLAttributes<HTMLDivElement>,
  'defaultValue' | 'onChange' | 'onCopy'
> {
  value?: string
  defaultValue?: string
  placeholder?: string
  size?: TxSensitiveInputSize
  status?: TxSensitiveInputStatus
  label?: string
  description?: string
  error?: string
  disabled?: boolean
  readOnly?: boolean
  required?: boolean
  copyable?: boolean
  mask?: string
  copiedDuration?: number
  labels?: Partial<TxSensitiveInputLabels>
  onChange?: (value: string) => void
  onCopy?: (value: string) => void
  onCopyError?: (error: unknown) => void
  onReveal?: () => void
  onMask?: () => void
}

export const TxSensitiveInput = forwardRef<HTMLInputElement, TxSensitiveInputProps>((
  {
    value,
    defaultValue = '',
    placeholder = '',
    size = 'md',
    status,
    label,
    description,
    error,
    disabled = false,
    readOnly = false,
    required = false,
    copyable = true,
    mask = '••••••••',
    copiedDuration = 2000,
    labels: customLabels,
    onChange,
    onCopy,
    onCopyError,
    onReveal,
    onMask,
    className,
    style,
    ...rest
  },
  ref,
) => {
  const [currentValue, setCurrentValue] = useControllableState<string>({
    value,
    defaultValue,
    onChange,
  })
  const [revealed, setRevealed] = useState(false)
  const [copied, setCopied] = useState(false)
  const [liveMessage, setLiveMessage] = useState('')
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const idBase = useId()
  const inputId = `${idBase}-input`
  const descId = `${idBase}-desc`
  const errId = `${idBase}-err`
  const srId = `${idBase}-sr`

  const mergedLabels = useMemo<TxSensitiveInputLabels>(
    () => ({ ...TX_SENSITIVE_INPUT_DEFAULT_LABELS, ...customLabels }),
    [customLabels],
  )

  useEffect(() => () => {
    if (copiedTimerRef.current !== null)
      clearTimeout(copiedTimerRef.current)
  }, [])

  const hasValue = currentValue.length > 0
  const isMasked = hasValue && !revealed
  const resolvedStatus: TxSensitiveInputStatus = status ?? (error ? 'error' : 'default')

  const reveal = useCallback(() => {
    if (disabled || revealed)
      return
    setRevealed(true)
    setLiveMessage('')
    onReveal?.()
  }, [disabled, onReveal, revealed])

  const hide = useCallback(() => {
    if (!revealed)
      return
    setRevealed(false)
    setLiveMessage(mergedLabels.hidden)
    onMask?.()
  }, [mergedLabels.hidden, onMask, revealed])

  const handleCopy = async (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    if (disabled || !hasValue)
      return
    try {
      if (hasNavigator() && navigator.clipboard?.writeText)
        await navigator.clipboard.writeText(currentValue)
      setCopied(true)
      setLiveMessage(mergedLabels.copySuccess)
      onCopy?.(currentValue)
      if (copiedTimerRef.current !== null)
        clearTimeout(copiedTimerRef.current)
      copiedTimerRef.current = setTimeout(() => setCopied(false), copiedDuration)
    }
    catch (err) {
      onCopyError?.(err)
    }
  }

  const handleMaskKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget)
      return
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      reveal()
    }
  }

  const fieldName = label || mergedLabels.fallbackName

  return (
    <div
      className={cn(
        'tx-sensitive-input',
        `tx-sensitive-input--${size}`,
        {
          'tx-sensitive-input--error': resolvedStatus === 'error',
          'is-disabled': disabled,
          'is-masked': isMasked,
          'is-revealed': revealed,
        },
        className,
      )}
      style={style}
      {...rest}
    >
      {label && (
        <label htmlFor={inputId} className="tx-sensitive-input__label">
          <span>{label}</span>
          {required && <span className="tx-sensitive-input__required" aria-hidden="true">*</span>}
        </label>
      )}

      <div className="tx-sensitive-input__group">
        {copyable && hasValue && (
          <button
            type="button"
            className={cn('tx-sensitive-input__copy', { 'is-copied': copied })}
            disabled={disabled}
            onClick={handleCopy}
          >
            {copied ? mergedLabels.copied : mergedLabels.copy}
          </button>
        )}

        {isMasked
          ? (
              <div
                className="tx-sensitive-input__field tx-sensitive-input__mask"
                role="button"
                tabIndex={disabled ? -1 : 0}
                aria-label={`${fieldName}, ${mergedLabels.masked}`}
                aria-describedby={srId}
                aria-disabled={disabled || undefined}
                onClick={reveal}
                onKeyDown={handleMaskKeyDown}
              >
                <span className="tx-sensitive-input__mask-stack">
                  <span className="tx-sensitive-input__mask-dots" aria-hidden="true">{mask}</span>
                  <span className="tx-sensitive-input__mask-reveal">{mergedLabels.reveal}</span>
                </span>
                <button
                  type="button"
                  className="tx-sensitive-input__eye"
                  aria-label={mergedLabels.show}
                  disabled={disabled}
                  onClick={(e) => {
                    e.stopPropagation()
                    reveal()
                  }}
                >
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
                    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                </button>
              </div>
            )
          : (
              <div className="tx-sensitive-input__field">
                <input
                  ref={mergeRefs(ref, inputRef)}
                  id={inputId}
                  type="text"
                  className="tx-sensitive-input__inner"
                  value={currentValue}
                  placeholder={placeholder}
                  disabled={disabled}
                  readOnly={readOnly}
                  required={required}
                  aria-invalid={resolvedStatus === 'error' || undefined}
                  aria-describedby={cn(error ? errId : undefined, description ? descId : undefined) || undefined}
                  onChange={e => setCurrentValue(e.target.value)}
                />
                {hasValue && (
                  <button
                    type="button"
                    className="tx-sensitive-input__eye"
                    aria-label={mergedLabels.hide}
                    disabled={disabled}
                    onClick={hide}
                  >
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-6.5 0-10-8-10-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c6.5 0 10 8 10 8a18.5 18.5 0 0 1-2.16 3.19" />
                      <line x1="2" y1="2" x2="22" y2="22" />
                    </svg>
                  </button>
                )}
              </div>
            )}
      </div>

      <span id={srId} className="tx-sensitive-input__sr">{mergedLabels.instruction}</span>
      <span className="tx-sensitive-input__sr" role="status" aria-live="polite">{liveMessage}</span>

      {error && <div id={errId} className="tx-sensitive-input__error" role="alert">{error}</div>}
      {description && !error && <div id={descId} className="tx-sensitive-input__description">{description}</div>}
    </div>
  )
})
TxSensitiveInput.displayName = 'TxSensitiveInput'

// ============================================================================
// 4. TxTagInput (tag-input)
// ============================================================================

export interface TxTagInputProps extends Omit<
  HTMLAttributes<HTMLDivElement>,
  'defaultValue' | 'onChange' | 'onFocus' | 'onBlur'
> {
  value?: string[]
  defaultValue?: string[]
  placeholder?: string
  disabled?: boolean
  max?: number
  allowDuplicates?: boolean
  separators?: string[]
  confirmOnBlur?: boolean
  onChange?: (value: string[]) => void
  onAdd?: (added: string[]) => void
  onRemove?: (tag: string) => void
  onFocus?: (event: FocusEvent<HTMLInputElement>) => void
  onBlur?: (event: FocusEvent<HTMLInputElement>) => void
}

export const TxTagInput = forwardRef<HTMLInputElement, TxTagInputProps>((
  {
    value,
    defaultValue = [],
    placeholder = 'Add tag...',
    disabled = false,
    max,
    allowDuplicates = false,
    separators = [',', ';'],
    confirmOnBlur = true,
    onChange,
    onAdd,
    onRemove,
    onFocus,
    onBlur,
    className,
    style,
    ...rest
  },
  ref,
) => {
  const [tags, setTags] = useControllableState<string[]>({
    value,
    defaultValue,
    onChange,
  })
  const [draft, setDraft] = useState('')
  const [focused, setFocused] = useState(false)
  const inputRef = useRef<HTMLInputElement | null>(null)

  const commitTokens = useCallback((rawText: string) => {
    if (disabled)
      return
    const escaped = separators.map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    const regex = escaped.length > 0 ? new RegExp(`[${escaped.join('')}]`, 'g') : null
    const parts = (regex ? rawText.split(regex) : [rawText])
      .map(part => part.trim())
      .filter(Boolean)

    if (parts.length === 0) {
      setDraft('')
      return
    }

    const next = [...tags]
    const added: string[] = []
    for (const token of parts) {
      if (max !== undefined && next.length >= max)
        break
      if (!allowDuplicates && next.includes(token))
        continue
      next.push(token)
      added.push(token)
    }

    setDraft('')
    if (added.length > 0) {
      setTags(next)
      onAdd?.(added)
    }
  }, [allowDuplicates, disabled, max, onAdd, separators, setTags, tags])

  const removeAt = useCallback((index: number) => {
    if (disabled)
      return
    const target = tags[index]
    if (target === undefined)
      return
    const next = tags.filter((_, i) => i !== index)
    setTags(next)
    onRemove?.(target)
  }, [disabled, onRemove, setTags, tags])

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (disabled)
      return
    if (event.key === 'Enter' || separators.includes(event.key)) {
      event.preventDefault()
      commitTokens(draft)
    }
    else if (event.key === 'Backspace' && draft === '' && tags.length > 0) {
      event.preventDefault()
      removeAt(tags.length - 1)
    }
  }

  const reachedMax = max !== undefined && tags.length >= max

  return (
    <div
      className={cn(
        'tx-tag-input',
        { 'is-focused': focused, 'is-disabled': disabled },
        className,
      )}
      style={style}
      onClick={() => inputRef.current?.focus()}
      {...rest}
    >
      <div className="tx-tag-input__tags">
        {tags.map((tag, idx) => (
          <TxTag
            key={`${tag}-${idx}`}
            label={tag}
            size="sm"
            variant="soft"
            closable={!disabled}
            disabled={disabled}
            onClose={() => removeAt(idx)}
          />
        ))}
        <input
          ref={mergeRefs(ref, inputRef)}
          type="text"
          className="tx-tag-input__input"
          value={draft}
          disabled={disabled || reachedMax}
          placeholder={tags.length === 0 ? placeholder : ''}
          aria-label={placeholder}
          onChange={(e) => {
            const val = e.target.value
            if (separators.some(sep => val.includes(sep)))
              commitTokens(val)
            else
              setDraft(val)
          }}
          onFocus={(e) => {
            setFocused(true)
            onFocus?.(e)
          }}
          onBlur={(e) => {
            setFocused(false)
            if (confirmOnBlur && draft.trim())
              commitTokens(draft)
            onBlur?.(e)
          }}
          onKeyDown={handleKeyDown}
        />
      </div>
    </div>
  )
})
TxTagInput.displayName = 'TxTagInput'

// ============================================================================
// 5. TxScrubField (scrub-field)
// ============================================================================

export interface TxScrubFieldProps extends Omit<HTMLAttributes<HTMLDivElement>, 'defaultValue' | 'onChange'> {
  value?: number
  defaultValue?: number
  label: string
  min: number
  max: number
  step?: number
  suffix?: string
  active?: boolean
  disabled?: boolean
  pixelsPerStep?: number
  shiftMultiplier?: number
  clampOn?: 'input' | 'blur'
  ariaLabel?: string
  valueLabel?: string
  onChange?: (value: number) => void
  onScrubStart?: () => void
  onScrubEnd?: () => void
}

export const TxScrubField = forwardRef<HTMLDivElement, TxScrubFieldProps>((
  {
    value,
    defaultValue,
    label,
    min,
    max,
    step = 1,
    suffix,
    active = false,
    disabled = false,
    pixelsPerStep = 2,
    shiftMultiplier = 10,
    clampOn = 'input',
    ariaLabel,
    valueLabel,
    onChange,
    onScrubStart,
    onScrubEnd,
    className,
    style,
    ...rest
  },
  ref,
) => {
  const clamp = useCallback((v: number) => Math.min(max, Math.max(min, v)), [min, max])
  const [currentValue, setCurrentValue] = useControllableState<number>({
    value,
    defaultValue: clamp(defaultValue ?? min),
    onChange,
  })
  const [scrubbing, setScrubbing] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const dragOriginRef = useRef<{ x: number, startValue: number } | null>(null)

  const handlePointerDown = (event: PointerEvent<HTMLSpanElement>) => {
    if (disabled)
      return
    event.preventDefault()
    dragOriginRef.current = { x: event.clientX, startValue: currentValue }
    setScrubbing(true)
    onScrubStart?.()
    if (typeof event.currentTarget.setPointerCapture === 'function') {
      try {
        event.currentTarget.setPointerCapture(event.pointerId)
      }
      catch {
        // Synthetic events in jsdom may not have an active pointer id
      }
    }
  }

  const handlePointerMove = (event: PointerEvent<HTMLSpanElement>) => {
    if (!scrubbing || !dragOriginRef.current || disabled)
      return
    const dx = event.clientX - dragOriginRef.current.x
    const steps = Math.trunc(dx / Math.max(1, pixelsPerStep))
    const mult = event.shiftKey ? shiftMultiplier : 1
    const next = clamp(dragOriginRef.current.startValue + steps * step * mult)
    setCurrentValue(next)
  }

  const endScrub = () => {
    if (!scrubbing)
      return
    dragOriginRef.current = null
    setScrubbing(false)
    onScrubEnd?.()
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (disabled)
      return
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault()
      const dir = event.key === 'ArrowUp' ? 1 : -1
      const mult = event.shiftKey ? shiftMultiplier : 1
      const next = clamp(currentValue + dir * step * mult)
      setCurrentValue(next)
      if (editing)
        setDraft(String(next))
    }
  }

  return (
    <div
      ref={ref}
      className={cn(
        'tx-bui-scrub-field',
        {
          'is-active': active,
          'is-scrubbing': scrubbing,
          'is-disabled': disabled,
        },
        className,
      )}
      style={style}
      {...rest}
    >
      <span
        className="tx-bui-scrub-field__handle"
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label={ariaLabel ?? label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={currentValue}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endScrub}
        onPointerCancel={endScrub}
      >
        {label}
      </span>
      <input
        type="text"
        inputMode="decimal"
        className="tx-bui-scrub-field__input"
        value={editing ? draft : String(currentValue)}
        disabled={disabled}
        aria-label={valueLabel ?? `${label} value`}
        onFocus={() => {
          setEditing(true)
          setDraft(String(currentValue))
        }}
        onChange={(e) => {
          const text = e.target.value
          setDraft(text)
          const parsed = Number(text)
          if (Number.isFinite(parsed) && text.trim() !== '') {
            setCurrentValue(clampOn === 'input' ? clamp(parsed) : parsed)
          }
        }}
        onBlur={() => {
          setEditing(false)
          const parsed = Number(draft)
          if (Number.isFinite(parsed) && draft.trim() !== '')
            setCurrentValue(clamp(parsed))
        }}
        onKeyDown={handleKeyDown}
      />
      {suffix && <span className="tx-bui-scrub-field__suffix">{suffix}</span>}
    </div>
  )
})
TxScrubField.displayName = 'TxScrubField'

// ============================================================================
// 6. TxSegmentedSlider (segmented-slider)
// ============================================================================

export interface TxSegmentedSliderSegment {
  value: number | string
  label?: string
}

export interface TxSegmentedSliderProps extends Omit<HTMLAttributes<HTMLDivElement>, 'defaultValue' | 'onChange'> {
  value?: number | string | null
  defaultValue?: number | string | null
  segments?: TxSegmentedSliderSegment[]
  disabled?: boolean
  showLabels?: boolean
  vertical?: boolean
  ariaLabel?: string
  onChange?: (value: number | string) => void
}

export const TxSegmentedSlider = forwardRef<HTMLDivElement, TxSegmentedSliderProps>((
  {
    value,
    defaultValue,
    segments = [],
    disabled = false,
    showLabels = true,
    vertical = false,
    ariaLabel = 'Segmented slider',
    onChange,
    className,
    style,
    ...rest
  },
  ref,
) => {
  const initial = defaultValue ?? segments[0]?.value ?? null
  const [currentValue, setCurrentValue] = useControllableState<number | string | null>({
    value,
    defaultValue: initial,
    onChange: (next) => {
      if (next !== null)
        onChange?.(next)
    },
  })

  const activeIndex = Math.max(0, segments.findIndex(s => s.value === currentValue))
  const progressPct = segments.length > 1 ? (activeIndex / (segments.length - 1)) * 100 : 0

  const selectIndex = (index: number) => {
    if (disabled || segments.length === 0)
      return
    const clampedIndex = Math.min(segments.length - 1, Math.max(0, index))
    const seg = segments[clampedIndex]
    if (seg)
      setCurrentValue(seg.value)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (disabled || segments.length === 0)
      return
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault()
      selectIndex(activeIndex + 1)
    }
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault()
      selectIndex(activeIndex - 1)
    }
    else if (event.key === 'Home') {
      event.preventDefault()
      selectIndex(0)
    }
    else if (event.key === 'End') {
      event.preventDefault()
      selectIndex(segments.length - 1)
    }
  }

  return (
    <div
      ref={ref}
      role="radiogroup"
      aria-label={ariaLabel}
      aria-disabled={disabled || undefined}
      className={cn(
        'tx-segmented-slider',
        { 'is-disabled': disabled, 'is-vertical': vertical },
        className,
      )}
      style={style}
      onKeyDown={handleKeyDown}
      {...rest}
    >
      <div className="tx-segmented-slider__track" aria-hidden="true">
        <div
          className="tx-segmented-slider__progress"
          style={vertical ? { height: `${progressPct}%` } : { width: `${progressPct}%` }}
        />
      </div>
      <div className="tx-segmented-slider__segments">
        {segments.map((seg, idx) => {
          const isActive = idx === activeIndex
          const isPassed = idx <= activeIndex
          return (
            <button
              key={String(seg.value)}
              type="button"
              role="radio"
              aria-checked={isActive}
              disabled={disabled}
              className={cn('tx-segmented-slider__segment', {
                'is-active': isActive,
                'is-passed': isPassed,
              })}
              onClick={() => selectIndex(idx)}
            >
              <span className="tx-segmented-slider__dot" aria-hidden="true" />
              {showLabels && (
                <span className="tx-segmented-slider__label">{seg.label ?? String(seg.value)}</span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
})
TxSegmentedSlider.displayName = 'TxSegmentedSlider'

// ============================================================================
// 7. TxRating (rating)
// ============================================================================

export interface TxRatingProps extends Omit<HTMLAttributes<HTMLDivElement>, 'defaultValue' | 'onChange'> {
  value?: number
  defaultValue?: number
  maxStars?: number
  precision?: number
  disabled?: boolean
  readOnly?: boolean
  showText?: boolean
  filledColor?: string
  emptyColor?: string
  hoverColor?: string
  textColor?: string
  size?: number | string
  gap?: number | string
  animated?: boolean
  formatText?: (value: number, maxStars: number) => string
  ariaLabel?: string
  onChange?: (value: number) => void
}

const STAR_PATH = 'M12 2.5l2.93 5.94 6.56.95-4.74 4.62 1.12 6.53L12 17.46 6.13 20.54l1.12-6.53L2.51 9.39l6.56-.95L12 2.5z'

export const TxRating = forwardRef<HTMLDivElement, TxRatingProps>((
  {
    value,
    defaultValue = 0,
    maxStars = 5,
    precision = 1,
    disabled = false,
    readOnly = false,
    showText = false,
    filledColor,
    emptyColor,
    hoverColor,
    textColor,
    size = 20,
    gap = 4,
    animated = true,
    formatText,
    ariaLabel = 'Rating',
    onChange,
    className,
    style,
    ...rest
  },
  ref,
) => {
  const [currentValue, setCurrentValue] = useControllableState<number>({
    value,
    defaultValue,
    onChange,
  })
  const [hoverValue, setHoverValue] = useState<number | null>(null)
  const displayValue = hoverValue ?? currentValue
  const isInteractive = !disabled && !readOnly
  const allowHalf = precision === 0.5

  const computeStarValue = (starIndex: number, event: MouseEvent<HTMLButtonElement>): number => {
    if (!allowHalf)
      return starIndex
    const rect = event.currentTarget.getBoundingClientRect()
    if (rect.width > 0 && event.clientX - rect.left <= rect.width / 2)
      return starIndex - 0.5
    return starIndex
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!isInteractive)
      return
    const step = allowHalf ? 0.5 : 1
    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
      event.preventDefault()
      setCurrentValue(Math.min(maxStars, currentValue + step))
    }
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
      event.preventDefault()
      setCurrentValue(Math.max(0, currentValue - step))
    }
    else if (event.key === 'Home') {
      event.preventDefault()
      setCurrentValue(0)
    }
    else if (event.key === 'End') {
      event.preventDefault()
      setCurrentValue(maxStars)
    }
  }

  const cssVars = {
    ...(filledColor ? { '--tx-rating-star-filled': filledColor } : {}),
    ...(emptyColor ? { '--tx-rating-star-empty': emptyColor } : {}),
    ...(hoverColor ? { '--tx-rating-star-hover': hoverColor } : {}),
    ...(textColor ? { '--tx-rating-text': textColor } : {}),
    '--tx-rating-star-size': toCssUnit(size, '20px'),
    '--tx-rating-star-gap': toCssUnit(gap, '4px'),
    ...style,
  } as CSSProperties

  const textLabel = formatText ? formatText(displayValue, maxStars) : `${displayValue} / ${maxStars}`

  return (
    <div
      ref={ref}
      role="slider"
      tabIndex={isInteractive ? 0 : -1}
      aria-label={ariaLabel}
      aria-valuemin={0}
      aria-valuemax={maxStars}
      aria-valuenow={currentValue}
      aria-disabled={disabled || undefined}
      aria-readonly={readOnly || undefined}
      className={cn(
        'tx-rating',
        {
          'tx-rating--animated': animated,
          'is-disabled': disabled,
          'is-readonly': readOnly,
        },
        className,
      )}
      style={cssVars}
      onMouseLeave={() => setHoverValue(null)}
      onKeyDown={handleKeyDown}
      {...rest}
    >
      <div className="tx-rating__stars">
        {Array.from({ length: maxStars }, (_, idx) => {
          const starNum = idx + 1
          const isFilled = displayValue >= starNum
          const isHalf = !isFilled && allowHalf && displayValue >= starNum - 0.5
          return (
            <button
              key={starNum}
              type="button"
              tabIndex={-1}
              disabled={disabled}
              aria-label={`Rate ${starNum} of ${maxStars}`}
              className={cn('tx-rating__star', {
                'tx-rating__star--filled': isFilled,
                'tx-rating__star--half': isHalf,
                'tx-rating__star--disabled': disabled,
              })}
              onMouseMove={(e) => {
                if (isInteractive)
                  setHoverValue(computeStarValue(starNum, e))
              }}
              onClick={(e) => {
                if (!isInteractive)
                  return
                setCurrentValue(computeStarValue(starNum, e))
              }}
            >
              <svg
                className={cn('tx-rating__icon', isFilled ? 'tx-rating__icon--filled' : 'tx-rating__icon--empty')}
                viewBox="0 0 24 24"
                width="1em"
                height="1em"
                aria-hidden="true"
              >
                <path
                  d={STAR_PATH}
                  fill={isFilled ? 'currentColor' : isHalf ? 'currentColor' : 'none'}
                  fillOpacity={isHalf ? 0.5 : 1}
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          )
        })}
      </div>
      {showText && <span className="tx-rating__text">{textLabel}</span>}
    </div>
  )
})
TxRating.displayName = 'TxRating'

// ============================================================================
// 8. TxFilterChips (filter-chips)
// ============================================================================

export type TxFilterChipValue = string | number
export type TxFilterChipsRole = 'toolbar' | 'tablist'

export interface TxFilterChipItem {
  value: TxFilterChipValue
  label: string
  iconClass?: string
  icon?: ReactNode
  dot?: string
  count?: number
  disabled?: boolean
}

export interface TxFilterChipsProps extends Omit<HTMLAttributes<HTMLDivElement>, 'defaultValue' | 'onChange' | 'role'> {
  value?: TxFilterChipValue
  defaultValue?: TxFilterChipValue
  items?: TxFilterChipItem[]
  disabled?: boolean
  role?: TxFilterChipsRole
  indicator?: boolean
  iconOnly?: boolean
  ariaLabel?: string
  onChange?: (value: TxFilterChipValue) => void
}

export const TxFilterChips = forwardRef<HTMLDivElement, TxFilterChipsProps>((
  {
    value,
    defaultValue,
    items = [],
    disabled = false,
    role = 'toolbar',
    indicator = true,
    iconOnly = false,
    ariaLabel = 'Filters',
    onChange,
    className,
    style,
    ...rest
  },
  ref,
) => {
  const [selected, setSelected] = useControllableState<TxFilterChipValue | undefined>({
    value,
    defaultValue: defaultValue ?? items[0]?.value,
    onChange: (next) => {
      if (next !== undefined)
        onChange?.(next)
    },
  })
  const groupRef = useRef<HTMLDivElement | null>(null)

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (disabled || !groupRef.current)
      return
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft' && event.key !== 'Home' && event.key !== 'End')
      return
    const buttons = Array.from(groupRef.current.querySelectorAll<HTMLButtonElement>('button.tx-bui-filter-chips__chip:not([disabled])'))
    if (buttons.length === 0)
      return
    const currentIdx = buttons.findIndex(b => b === document.activeElement)
    let nextIdx = 0
    if (event.key === 'Home')
      nextIdx = 0
    else if (event.key === 'End')
      nextIdx = buttons.length - 1
    else if (event.key === 'ArrowRight')
      nextIdx = currentIdx < 0 ? 0 : (currentIdx + 1) % buttons.length
    else
      nextIdx = currentIdx < 0 ? buttons.length - 1 : (currentIdx - 1 + buttons.length) % buttons.length

    const target = buttons[nextIdx]
    if (target) {
      event.preventDefault()
      target.focus()
      if (role === 'tablist')
        target.click()
    }
  }

  return (
    <div
      ref={mergeRefs(ref, groupRef)}
      role={role}
      aria-label={ariaLabel}
      aria-disabled={disabled || undefined}
      className={cn(
        'tx-bui-filter-chips',
        { 'has-indicator': indicator, 'is-disabled': disabled },
        className,
      )}
      style={style}
      onKeyDown={handleKeyDown}
      {...rest}
    >
      {items.map((item) => {
        const isActive = item.value === selected
        const isDisabled = disabled || Boolean(item.disabled)
        const showIconOnly = iconOnly && Boolean(item.iconClass || item.icon)
        return (
          <button
            key={String(item.value)}
            type="button"
            role={role === 'tablist' ? 'tab' : undefined}
            aria-selected={role === 'tablist' ? isActive : undefined}
            aria-pressed={role === 'toolbar' ? isActive : undefined}
            aria-label={showIconOnly ? item.label : undefined}
            title={showIconOnly ? item.label : undefined}
            disabled={isDisabled}
            className={cn('tx-bui-filter-chips__chip', {
              'is-active': isActive,
              'is-disabled': isDisabled,
            })}
            onClick={() => {
              if (!isDisabled)
                setSelected(item.value)
            }}
          >
            {item.icon
              ? <span className="tx-bui-filter-chips__icon" aria-hidden="true">{item.icon}</span>
              : item.iconClass
                ? <i className={cn('tx-bui-filter-chips__icon', item.iconClass)} aria-hidden="true" />
                : null}
            {item.dot && (
              <span
                className="tx-bui-filter-chips__dot"
                style={{ backgroundColor: item.dot }}
                aria-hidden="true"
              />
            )}
            {!showIconOnly && <span className="tx-bui-filter-chips__label">{item.label}</span>}
            {item.count !== undefined && (
              <span className="tx-bui-filter-chips__count">{item.count}</span>
            )}
          </button>
        )
      })}
    </div>
  )
})
TxFilterChips.displayName = 'TxFilterChips'
