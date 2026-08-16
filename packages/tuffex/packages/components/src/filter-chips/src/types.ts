// Adapted from Beautiful UI (https://www.beautifului.dev), © 2026 Shane Levine, MIT.

/**
 * Value identifying a chip.
 *
 * @public
 */
export type FilterChipValue = string | number

/**
 * ARIA shape of the chip row.
 *
 * - `toolbar`: a filter control. Chips are toggle buttons (`aria-pressed`) and
 *   arrow keys move focus without changing the filter.
 * - `tablist`: chips label mutually exclusive panels. Chips become tabs
 *   (`aria-selected`) and selection follows focus.
 *
 * @public
 */
export type FilterChipsRole = 'toolbar' | 'tablist'

/**
 * A single chip.
 *
 * @public
 */
export interface FilterChipItem {
  value: FilterChipValue
  label: string

  /** Leading dot colour. Any CSS colour; omit to render no dot. */
  dot?: string

  /**
   * Trailing count badge. Omit to render no badge.
   *
   * Derive this from the data you are filtering — the upstream demo hardcodes
   * literals, which start lying the moment a row is added.
   */
  count?: number

  disabled?: boolean
}

/**
 * Props for {@link TxFilterChips}.
 *
 * @public
 */
export interface FilterChipsProps {
  /** Selected chip value. */
  modelValue?: FilterChipValue

  /** @default [] */
  items?: FilterChipItem[]

  /** Disables every chip. @default false */
  disabled?: boolean

  /** @default 'toolbar' */
  role?: FilterChipsRole

  /** Accessible name for the chip row. @default 'Filters' */
  ariaLabel?: string
}

/**
 * Emits for {@link TxFilterChips}.
 *
 * @public
 */
export interface FilterChipsEmits {
  (e: 'update:modelValue', value: FilterChipValue): void
  (e: 'change', value: FilterChipValue): void
}
