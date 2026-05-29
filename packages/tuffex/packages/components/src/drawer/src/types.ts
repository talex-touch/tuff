/**
 * Direction from which the drawer appears.
 *
 * @public
 */
export type DrawerDirection = 'left' | 'right' | 'top' | 'bottom'

/**
 * Size value for the drawer panel.
 * `full` maps to `100%` on the active axis.
 *
 * @public
 */
export type DrawerSize = number | string | 'full'

/**
 * Visual effect used by the backdrop mask.
 *
 * @public
 */
export type DrawerMaskEffect = 'blur' | 'opacity' | 'transparent'

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
   * The size of the drawer on the active axis.
   * Left/right directions use it as width; top/bottom directions use it as height.
   * Accepts CSS lengths, percentages, numbers as px, and `full` for 100%.
   * @default '60%'
   */
  size?: DrawerSize

  /**
   * Whether to force the drawer to open at 100% on the active axis.
   * Equivalent to `size="full"`, but easier to discover in templates.
   * @default false
   */
  full?: boolean

  /**
   * @deprecated Use `size` instead. Kept for backwards compatibility.
   */
  width?: DrawerSize

  /**
   * The direction from which the drawer appears.
   * @default 'right'
   */
  direction?: DrawerDirection

  /**
   * Whether to render the header area.
   * @default true
   */
  showHeader?: boolean

  /**
   * Whether to render the footer slot area.
   * @default true
   */
  showFooter?: boolean

  /**
   * Whether to show the close button in the default header.
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
   * The mask visual effect.
   * `blur` applies backdrop blur and opacity; `opacity` only dims; `transparent` keeps the mask invisible.
   * @default 'blur'
   */
  maskEffect?: DrawerMaskEffect

  /**
   * Whether the drawer panel background should let the back layer show through.
   * @default false
   */
  panelTransparent?: boolean

  /**
   * Whether mobile viewport should force the drawer to slide from bottom.
   * @default true
   */
  mobileAdapt?: boolean

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
