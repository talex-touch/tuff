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

  /**
   * Leading icon class, drawn before the dot and the label. Same shape as
   * `TabBarItem.iconClass` and `CardItemProps.iconClass`.
   *
   * A row of chips that carry only words reads as one run-on sentence; the icon
   * is what gives each chip a leading edge. It is decorative — `label` still has
   * to name the chip on its own.
   */
  iconClass?: string

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

  /**
   * Paints the active chip's fill as one element that slides between chips
   * instead of colouring each chip in place. The resting look is identical
   * either way; only the transition between two chips differs.
   *
   * @default true
   */
  indicator?: boolean

  /**
   * Draws only each chip's `iconClass`, moving its `label` onto `aria-label` and
   * `title` so the chip still names itself to assistive tech and on hover. A
   * chip without an `iconClass` keeps its visible label — a blank chip would be
   * worse than a wordy one.
   *
   * @default false
   */
  iconOnly?: boolean

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
