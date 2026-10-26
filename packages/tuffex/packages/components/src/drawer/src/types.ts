import type { BaseSurfaceMode } from '../../base-surface/src/types'

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
 * How the user asked to close: `escape`, a click on the `mask`, or `close` —
 * the close button, or the `close` the header and footer slots receive.
 *
 * @public
 */
export type DrawerCloseReason = 'escape' | 'mask' | 'close'

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
   * Accessible label for the default header's close button.
   * @default 'Close drawer'
   */
  closeLabel?: string

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
   * Asked before the drawer closes at the user's request. Return `false`, or
   * a promise of it, to keep it open. Setting `visible` to `false` is not asked.
   */
  beforeClose?: (reason: DrawerCloseReason) => boolean | void | Promise<boolean | void>

  /**
   * The mask visual effect.
   * `blur` applies backdrop blur and opacity; `opacity` only dims; `transparent` keeps the mask invisible.
   * @default 'blur'
   */
  maskEffect?: DrawerMaskEffect

  /**
   * Whether more of the back layer should show through the panel: thins the colour under a
   * translucent material (see `surfaceOpacity`). A `pure` or `flat` panel stays opaque.
   * @default false
   */
  panelTransparent?: boolean

  /**
   * Material of the panel. `pure` paints `surfaceColor` solid; `mask`, `blur`, `acrylic`,
   * `glass` and `refraction` let the page show through.
   * @default 'pure'
   */
  surface?: BaseSurfaceMode

  /**
   * Colour laid under the material.
   * @default 'var(--tx-drawer-panel-background)'
   */
  surfaceColor?: string

  /**
   * Opacity of that colour (0–1): 0.96 under `mask` and 0.5 under `blur`, `acrylic`, `glass`
   * and `refraction`, which `panelTransparent` thins to 0.78 and 0.3. `pure` and `flat` stay
   * opaque, and `mica` and `plain` lay no colour.
   */
  surfaceOpacity?: number

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

  /**
   * Whether to defer rendering the drawer's slot content until it first opens.
   *
   * The drawer root stays mounted for its whole life so the slide-out animation can run and the
   * `visibility` paint contract holds; only the header/body/footer content is gated. A drawer that
   * is never opened therefore costs nothing beyond its own shell, which matters on pages that
   * mount several of them at once.
   *
   * Content is kept alive after the first open, so reopening never re-runs child `setup`.
   * Set to `false` when a child must mount eagerly - to register a global listener or warm a
   * request before the user ever opens the drawer, say.
   * @default true
   */
  lazy?: boolean
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
