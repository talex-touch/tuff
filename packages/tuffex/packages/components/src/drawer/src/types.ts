/**
 * Props interface for the TxDrawer component.
 *
 * @public
 */
export interface DrawerProps {
  /**
   * The title displayed in the drawer header.
   * @default 'Drawer'
   */
  title?: string

  /**
   * Controls the visibility of the drawer.
   * Use with v-model:visible for two-way binding.
   */
  visible: boolean

  /**
   * The width of the drawer.
   * Accepts CSS width values.
   * @default '60%'
   */
  width?: string

  /**
   * The direction from which the drawer appears.
   * @default 'right'
   */
  direction?: 'left' | 'right'

  /**
   * Whether to show the close button.
   * @default true
   */
  showClose?: boolean

  /**
   * Whether clicking the mask closes the drawer.
   * @default true
   */
  closeOnClickMask?: boolean

  /**
   * Whether pressing Escape closes the drawer.
   * @default true
   */
  closeOnPressEscape?: boolean

  /**
   * Custom z-index for the drawer.
   * @default 1998
   */
  zIndex?: number
}

/**
 * Emits interface for the TxDrawer component.
 *
 * @public
 */
export interface DrawerEmits {
  /**
   * Emitted when the visible state changes.
   * @param visible - The new visibility state
   */
  (e: 'update:visible', visible: boolean): void

  /**
   * Emitted when the drawer is closed.
   */
  (e: 'close'): void

  /**
   * Emitted when the drawer is opened.
   */
  (e: 'open'): void
}
