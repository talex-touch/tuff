// Adapted from Beautiful UI (https://www.beautifului.dev), © 2026 Shane Levine, MIT.

export interface ScrubFieldProps {
  modelValue: number
  /** Short caption that doubles as the drag handle, e.g. 'W'. */
  label: string
  min: number
  max: number
  /** @default 1 */
  step?: number
  /** Unit shown after the value, e.g. '%'. */
  suffix?: string
  /** Tints the field to mark it as changed. The host decides what "changed" means. */
  active?: boolean
  disabled?: boolean
  /** Pointer travel that advances one step. @default 2 */
  pixelsPerStep?: number
  /** Arrow-key multiplier while Shift is held. @default 10 */
  shiftMultiplier?: number
  /**
   * `input` clamps on every keystroke (upstream); `blur` keeps the typed text
   * until the field is left, so typing `5` on the way to `50` is not rewritten.
   * @default 'input'
   */
  clampOn?: 'input' | 'blur'
  /** Accessible name for the handle. Falls back to `label`. */
  ariaLabel?: string
  /** Accessible name for the number input. @default `${label} value` */
  valueLabel?: string
}

export interface ScrubFieldEmits {
  (e: 'update:modelValue', value: number): void
  (e: 'change', value: number): void
  (e: 'scrubStart'): void
  (e: 'scrubEnd'): void
}
