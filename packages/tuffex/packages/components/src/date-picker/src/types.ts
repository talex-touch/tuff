export type DatePickerVariant = 'picker' | 'field' | 'adaptive'

/** Which grid the field calendar is showing. */
export type DatePickerPanelView = 'day' | 'month' | 'year'

/**
 * Range value: `[start, end]`, each `YYYY-MM-DD`. The model is only emitted
 * once both ends are chosen, so a consumer never sees a half-picked range.
 */
export type DateRangeValue = [string, string]

export type DatePickerValue = string | DateRangeValue

export interface DatePickerProps {
  modelValue?: DatePickerValue
  visible?: boolean
  popup?: boolean
  variant?: DatePickerVariant
  title?: string
  placeholder?: string
  min?: string
  max?: string
  disabled?: boolean
  showToolbar?: boolean
  confirmText?: string
  cancelText?: string
  closeOnClickMask?: boolean
  adaptiveBreakpoint?: number
  weekStartsOn?: 0 | 1
  /**
   * Field calendar only: pick a start and an end date. `modelValue` becomes a
   * `[start, end]` pair. The wheel picker has no range surface and ignores it.
   */
  range?: boolean
  /** Text between the two dates in the field's display value. */
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
