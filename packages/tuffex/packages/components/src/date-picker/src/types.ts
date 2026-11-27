export type DatePickerVariant = 'picker' | 'field' | 'adaptive'

/** Which grid the field calendar is showing. */
export type DatePickerPanelView = 'day' | 'month' | 'year'

/**
 * Selection surface and value format:
 * - `date`: `YYYY-MM-DD`
 * - `time`: `HH:mm` (or `HH:mm:ss` with `showSeconds`)
 * - `datetime`: `YYYY-MM-DD HH:mm` (or `YYYY-MM-DD HH:mm:ss`)
 * - `daterange`: `[start, end]` dates
 * - `datetimerange`: `[start, end]` date-times
 */
export type DatePickerMode = 'date' | 'time' | 'datetime' | 'daterange' | 'datetimerange'

/**
 * Range value: `[start, end]`. The model is only emitted once both ends are
 * chosen, so a consumer never sees a half-picked range.
 */
export type DateRangeValue = [string, string]

export type DatePickerValue = string | DateRangeValue

export interface DatePickerPreset {
  label: string
  value: DatePickerValue | (() => DatePickerValue)
}

export interface DatePickerProps {
  modelValue?: DatePickerValue
  visible?: boolean
  popup?: boolean
  variant?: DatePickerVariant
  /**
   * Selection mode (`date` | `time` | `datetime` | `daterange` | `datetimerange`).
   * Leaving `mode` unset while passing `range: true` resolves to `daterange`.
   */
  mode?: DatePickerMode
  title?: string
  placeholder?: string
  min?: string
  max?: string
  disabled?: boolean
  clearable?: boolean
  showToolbar?: boolean
  showSeconds?: boolean
  minuteStep?: number
  secondStep?: number
  presets?: DatePickerPreset[]
  confirmText?: string
  cancelText?: string
  todayText?: string
  nowText?: string
  startPlaceholder?: string
  endPlaceholder?: string
  timeLabel?: string
  closeOnClickMask?: boolean
  adaptiveBreakpoint?: number
  weekStartsOn?: 0 | 1
  /**
   * Field calendar shorthand for range selection. Pair with `mode="datetime"`
   * for `datetimerange`, or set `mode="daterange"` / `mode="datetimerange"` directly.
   */
  range?: boolean
  /** Text between the two endpoints in the field's display value. */
  rangeSeparator?: string
}

export interface DatePickerEmits {
  (e: 'update:modelValue', v: DatePickerValue): void
  (e: 'change', v: DatePickerValue): void
  (e: 'update:visible', v: boolean): void
  (e: 'confirm', v: DatePickerValue): void
  (e: 'cancel'): void
  (e: 'open'): void
  (e: 'close'): void
}
