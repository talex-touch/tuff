import type { ChangeEvent, HTMLAttributes } from 'react'
import { forwardRef, useState } from 'react'
import { useControllableState } from '../hooks/useControllableState'
import { cn } from '../utils/cn'

export interface TxSliderProps extends Omit<HTMLAttributes<HTMLDivElement>, 'onChange' | 'defaultValue'> {
  value?: number
  defaultValue?: number
  min?: number
  max?: number
  step?: number
  disabled?: boolean
  ariaLabel?: string
  ariaLabelledby?: string
  showValue?: boolean
  formatValue?: (value: number) => string
  thumbSurface?: boolean
  thumbVariant?: 'solid' | 'blur' | 'glass'
  showTooltip?: boolean
  tooltipTrigger?: 'drag' | 'hover' | 'always'
  tooltipFormatter?: (value: number) => string
  tooltipPlacement?: 'top' | 'bottom'
  onChange?: (value: number) => void
  onChangeCommit?: (value: number) => void
}

export const TxSlider = forwardRef<HTMLDivElement, TxSliderProps>((
  {
    value,
    defaultValue = 0,
    min = 0,
    max = 100,
    step = 1,
    disabled = false,
    ariaLabel,
    ariaLabelledby,
    showValue = false,
    formatValue,
    thumbSurface = true,
    thumbVariant = 'blur',
    showTooltip = true,
    tooltipTrigger = 'drag',
    tooltipFormatter,
    tooltipPlacement = 'top',
    onChange,
    onChangeCommit,
    className,
    ...rest
  },
  ref,
) => {
  const clamp = (v: number) => Math.min(max, Math.max(min, Number.isFinite(v) ? v : min))

  const [currentValue, setCurrentValue] = useControllableState<number>({
    value: value !== undefined ? clamp(value) : undefined,
    defaultValue: clamp(defaultValue),
    onChange,
  })

  const [dragging, setDragging] = useState(false)
  const [hovering, setHovering] = useState(false)

  const clamped = clamp(currentValue)
  const range = max - min
  const percent = range <= 0 ? 0 : ((clamped - min) / range) * 100
  const displayValue = formatValue ? formatValue(clamped) : String(clamped)
  const tooltipText = tooltipFormatter ? tooltipFormatter(clamped) : displayValue
  const valueText = (tooltipFormatter || formatValue) ? tooltipText : undefined

  const shouldShowTooltip = showTooltip && !disabled && (
    tooltipTrigger === 'always'
      ? true
      : tooltipTrigger === 'hover'
        ? (hovering || dragging)
        : dragging
  )

  const handleInput = (event: ChangeEvent<HTMLInputElement>) => {
    const next = clamp(Number(event.target.value))
    setCurrentValue(next)
  }

  return (
    <div
      ref={ref}
      className={cn(
        'tx-slider',
        {
          'is-disabled': disabled,
          'is-hovering': hovering && !disabled,
          'is-dragging': dragging,
          'has-surface': thumbSurface,
          [`is-thumb-${thumbVariant}`]: thumbSurface,
        },
        className,
      )}
      {...rest}
    >
      <div
        className="tx-slider__main"
        onPointerEnter={() => setHovering(true)}
        onPointerLeave={() => setHovering(false)}
      >
        <div className="tx-slider__track" aria-hidden="true">
          <div className="tx-slider__range" style={{ width: `${percent}%` }} />
        </div>

        {thumbSurface && (
          <div
            className="tx-slider__surface"
            aria-hidden="true"
            style={{ left: `${percent}%` }}
          />
        )}

        {shouldShowTooltip && (
          <div
            className="tx-slider__tooltip"
            style={{
              left: `${percent}%`,
              top: tooltipPlacement === 'bottom' ? '32px' : '-32px',
            }}
          >
            {tooltipText}
          </div>
        )}

        <input
          className="tx-slider__input"
          type="range"
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          value={clamped}
          aria-label={ariaLabel}
          aria-labelledby={ariaLabelledby}
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={clamped}
          aria-valuetext={valueText}
          onPointerDown={() => {
            if (!disabled)
              setDragging(true)
          }}
          onPointerUp={() => {
            if (dragging) {
              setDragging(false)
              onChangeCommit?.(clamped)
            }
          }}
          onBlur={() => setDragging(false)}
          onChange={handleInput}
        />
      </div>

      {showValue && <div className="tx-slider__value">{displayValue}</div>}
    </div>
  )
})
