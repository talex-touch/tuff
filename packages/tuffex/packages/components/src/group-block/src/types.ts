import type { TxIconSource } from '../../icon'

type IconValue = TxIconSource | string | null | undefined

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
   * Description text displayed below the name.
   * @default ''
   */
  description?: string

  /**
   * Default icon to display in the header.
   */
  defaultIcon?: IconValue

  /**
   * Active icon to display when expanded.
   */
  activeIcon?: IconValue

  /**
   * Header icon size in pixels.
   * @default 22
   */
  iconSize?: number

  /**
   * Whether the block can be toggled.
   * @default true
   */
  collapsible?: boolean

  /**
   * External collapsed state.
   * When provided, initial expanded state follows this unless user has interacted.
   * @default false
   */
  collapsed?: boolean

  /**
   * Initial expanded state.
   * @default true
   */
  defaultExpand?: boolean

  /**
   * Persist expanded state in localStorage.
   */
  memoryName?: string

  /**
   * Legacy icon class name (alias for defaultIcon).
   * @deprecated Use defaultIcon instead.
   */
  icon?: string

  /**
   * Legacy filled icon toggle (kept for compatibility).
   * @deprecated Use activeIcon instead.
   */
  expandFill?: boolean

  /**
   * Legacy collapsed state (alias for collapsed).
   * @deprecated Use collapsed/defaultExpand instead.
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
  (e: 'toggle', expanded: boolean): void
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
  title?: string

  /**
   * The description text displayed below the title.
   */
  description?: string

  /**
   * Default icon to display.
   */
  defaultIcon?: IconValue

  /**
   * Active icon to display when active.
   */
  activeIcon?: IconValue

  /**
   * Header icon size in pixels.
   * @default 20
   */
  iconSize?: number

  /**
   * Whether the block slot is active.
   * @default false
   */
  active?: boolean

  /**
   * Whether the block slot is disabled.
   * @default false
   */
  disabled?: boolean

  /**
   * Legacy icon class name (alias for defaultIcon).
   * @deprecated Use defaultIcon instead.
   */
  icon?: string
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
   * Default icon to display.
   */
  defaultIcon?: IconValue

  /**
   * Active icon to display when active.
   */
  activeIcon?: IconValue

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

  /**
   * Whether to show loading state.
   * @default false
   */
  loading?: boolean

  /**
   * Legacy icon class name (alias for defaultIcon).
   * @deprecated Use defaultIcon instead.
   */
  icon?: string
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

  /**
   * Emitted when the block is clicked in guidance mode.
   * @param event - The mouse event
   */
  (e: 'click', event: MouseEvent): void
}

/**
 * Props interface for the TxBlockInput component.
 *
 * @public
 */
export interface BlockInputProps {
  /**
   * The title text of the block input.
   */
  title?: string

  /**
   * The description text displayed below the title.
   */
  description?: string

  /**
   * The current input value for v-model binding.
   */
  modelValue?: string | number

  /**
   * Default icon to display.
   */
  defaultIcon?: IconValue

  /**
   * Active icon to display when focused.
   */
  activeIcon?: IconValue

  /**
   * Whether the block input is disabled.
   * @default false
   */
  disabled?: boolean

  /**
   * Input placeholder text.
   * @default ''
   */
  placeholder?: string

  /**
   * Whether the input is clearable.
   * @default false
   */
  clearable?: boolean

  /**
   * Input type (text, password, number, etc.).
   * @default 'text'
   */
  inputType?: 'text' | 'password' | 'number' | 'email'

  /**
   * Legacy icon class name (alias for defaultIcon).
   * @deprecated Use defaultIcon instead.
   */
  icon?: string
}

/**
 * Emits interface for the TxBlockInput component.
 *
 * @public
 */
export interface BlockInputEmits {
  /**
   * Emitted when the input value changes.
   * @param value - The new input value
   */
  (e: 'update:modelValue', value: string | number): void

  /**
   * Emitted on input event.
   * @param value - The new input value
   */
  (e: 'input', value: string | number): void

  /**
   * Emitted when the input is focused.
   * @param event - The focus event
   */
  (e: 'focus', event: FocusEvent): void

  /**
   * Emitted when the input loses focus.
   * @param event - The focus event
   */
  (e: 'blur', event: FocusEvent): void
}

/**
 * Props interface for the TxBlockSelect component.
 *
 * @public
 */
export interface BlockSelectProps {
  /**
   * The title text of the block select.
   */
  title?: string

  /**
   * The description text displayed below the title.
   */
  description?: string

  /**
   * The current select value for v-model binding.
   */
  modelValue?: string | number

  /**
   * Default icon to display.
   */
  defaultIcon?: IconValue

  /**
   * Active icon to display when a value is selected.
   */
  activeIcon?: IconValue

  /**
   * Whether the block select is disabled.
   * @default false
   */
  disabled?: boolean

  /**
   * Select placeholder text.
   * @default ''
   */
  placeholder?: string

  /**
   * Legacy icon class name (alias for defaultIcon).
   * @deprecated Use defaultIcon instead.
   */
  icon?: string
}

/**
 * Emits interface for the TxBlockSelect component.
 *
 * @public
 */
export interface BlockSelectEmits {
  /**
   * Emitted when the select value changes.
   * @param value - The new select value
   */
  (e: 'update:modelValue', value: string | number): void

  /**
   * Emitted when the select value changes.
   * @param value - The new select value
   */
  (e: 'change', value: string | number): void
}
