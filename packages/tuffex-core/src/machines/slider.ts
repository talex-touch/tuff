import type { ComputedRef } from '@vue/reactivity'
import { computed, shallowRef } from '@vue/reactivity'

export interface SliderMachineOptions {
  min?: number
  max?: number
  step?: number
  defaultValue?: number
  value?: () => number | undefined
  disabled?: () => boolean
  onChange?: (value: number) => void
}

export interface SliderMachine {
  value: ComputedRef<number>
  percentage: ComputedRef<number>
  min: number
  max: number
  step: number
  setValue: (next: number) => number
  setFromRatio: (ratio: number) => number
  increment: (multiplier?: number) => number
  decrement: (multiplier?: number) => number
  handleKeydown: (event: Pick<KeyboardEvent, 'key' | 'preventDefault'>) => boolean
}

function decimalsOf(step: number): number {
  const str = String(step)
  const dot = str.indexOf('.')
  return dot === -1 ? 0 : str.length - dot - 1
}

export function createSliderMachine(options: SliderMachineOptions = {}): SliderMachine {
  const min = options.min ?? 0
  const max = options.max ?? 100
  const step = options.step && options.step > 0 ? options.step : 1
  const precision = decimalsOf(step)

  function clampAndSnap(raw: number): number {
    if (!Number.isFinite(raw))
      return min
    const clamped = Math.min(max, Math.max(min, raw))
    const snapped = min + Math.round((clamped - min) / step) * step
    const bounded = Math.min(max, Math.max(min, snapped))
    return precision > 0 ? Number(bounded.toFixed(precision)) : Math.round(bounded)
  }

  const internalValue = shallowRef<number>(clampAndSnap(options.defaultValue ?? min))

  const value = computed<number>(() => {
    const controlled = options.value?.()
    return controlled !== undefined ? clampAndSnap(controlled) : internalValue.value
  })

  const percentage = computed<number>(() => {
    const span = max - min
    if (span <= 0)
      return 0
    return ((value.value - min) / span) * 100
  })

  function setValue(next: number): number {
    if (options.disabled?.())
      return value.value
    const snapped = clampAndSnap(next)
    if (Object.is(snapped, value.value))
      return snapped
    if (options.value?.() === undefined)
      internalValue.value = snapped
    options.onChange?.(snapped)
    return snapped
  }

  function setFromRatio(ratio: number): number {
    const clampedRatio = Math.min(1, Math.max(0, ratio))
    return setValue(min + clampedRatio * (max - min))
  }

  function increment(multiplier = 1): number {
    return setValue(value.value + step * multiplier)
  }

  function decrement(multiplier = 1): number {
    return setValue(value.value - step * multiplier)
  }

  function handleKeydown(event: Pick<KeyboardEvent, 'key' | 'preventDefault'>): boolean {
    if (options.disabled?.())
      return false
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowUp':
        event.preventDefault()
        increment(1)
        return true
      case 'ArrowLeft':
      case 'ArrowDown':
        event.preventDefault()
        decrement(1)
        return true
      case 'PageUp':
        event.preventDefault()
        increment(10)
        return true
      case 'PageDown':
        event.preventDefault()
        decrement(10)
        return true
      case 'Home':
        event.preventDefault()
        setValue(min)
        return true
      case 'End':
        event.preventDefault()
        setValue(max)
        return true
      default:
        return false
    }
  }

  return {
    value,
    percentage,
    min,
    max,
    step,
    setValue,
    setFromRatio,
    increment,
    decrement,
    handleKeydown,
  }
}
