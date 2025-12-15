/**
 * Props interface for the TxGroupBlock component.
 *
 * @public
 */
export interface GroupBlockProps {
  /**
   * The name/title of the group block.
   */
  name: string

  /**
   * Icon class name to display in the header.
   * @default ''
   */
  icon?: string

  /**
   * Description text displayed below the name.
   * @default ''
   */
  description?: string

  /**
   * Whether to use filled icon style when expanded.
   * @default false
   */
  expandFill?: boolean

  /**
   * Whether the group block starts in collapsed state.
   * @default false
   */
  shrink?: boolean
}

/**
 * Emits interface for the TxGroupBlock component.
 *
 * @public
 */
export interface GroupBlockEmits {
  /**
   * Emitted when the expand state changes.
   * @param expanded - The new expanded state
   */
  (e: 'update:expanded', expanded: boolean): void

  /**
   * Emitted when the header is clicked.
   */
  (e: 'toggle'): void
}

/**
 * Props interface for the TxBlockLine component.
 *
 * @public
 */
export interface BlockLineProps {
  /**
   * The title text of the block line.
   * @default ''
   */
  title?: string

  /**
   * The description text displayed beside the title.
   * @default ''
   */
  description?: string

  /**
   * Whether to display as a clickable link style.
   * @default false
   */
  link?: boolean
}

/**
 * Emits interface for the TxBlockLine component.
 *
 * @public
 */
export interface BlockLineEmits {
  /**
   * Emitted when the block line is clicked.
   * @param event - The mouse event
   */
  (e: 'click', event: MouseEvent): void
}

/**
 * Props interface for the TxBlockSlot component.
 *
 * @public
 */
export interface BlockSlotProps {
  /**
   * The title text of the block slot.
   */
  title: string

  /**
   * The description text displayed below the title.
   */
  description: string

  /**
   * Icon class name to display.
   */
  icon: string

  /**
   * Whether the block slot is disabled.
   * @default false
   */
  disabled?: boolean
}

/**
 * Emits interface for the TxBlockSlot component.
 *
 * @public
 */
export interface BlockSlotEmits {
  /**
   * Emitted when the block slot is clicked.
   * @param event - The mouse event
   */
  (e: 'click', event: MouseEvent): void
}

/**
 * Props interface for the TxBlockSwitch component.
 *
 * @public
 */
export interface BlockSwitchProps {
  /**
   * The title text of the block switch.
   */
  title: string

  /**
   * The description text displayed below the title.
   */
  description: string

  /**
   * The current switch value for v-model binding.
   */
  modelValue: boolean

  /**
   * Icon class name to display.
   */
  icon: string

  /**
   * Whether the block switch is disabled.
   * @default false
   */
  disabled?: boolean

  /**
   * Whether to display as a guidance/navigation item instead of a switch.
   * @default false
   */
  guidance?: boolean
}

/**
 * Emits interface for the TxBlockSwitch component.
 *
 * @public
 */
export interface BlockSwitchEmits {
  /**
   * Emitted when the switch value changes.
   * @param value - The new switch value
   */
  (e: 'update:modelValue', value: boolean): void

  /**
   * Emitted when the switch value changes.
   * @param value - The new switch value
   */
  (e: 'change', value: boolean): void
}
