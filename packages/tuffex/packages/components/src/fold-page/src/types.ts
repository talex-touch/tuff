import type { BaseSurfaceMode } from '../../base-surface/src/types'

export type FoldPageDirection = 'horizontal' | 'vertical'
export type FoldPageStyle = 'accordion' | 'gate'
export type FoldPageSize = 'xs' | 'sm' | 'md' | 'lg'

export type FoldCornerPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
export type FoldCornerTrigger = 'hover' | 'click' | 'drag' | 'hover-drag'

export interface FoldPagePanel {
  id?: string | number
  title?: string
  subtitle?: string
  badge?: string
  content?: string
  accent?: string
}

export interface FoldPageLabels {
  expand?: string
  collapse?: string
  toggle?: string
}

export interface FoldPageProps {
  /** Whether the fold spread is open (flat). Bind with `v-model`. @default false */
  modelValue?: boolean
  /** Continuous fold openness `0` (folded) to `1` (flat). Bind with `v-model:progress`. */
  progress?: number
  /** Panel definitions when not supplying custom slot markup alone. */
  panels?: FoldPagePanel[]
  /** Number of panels when `panels` is omitted (minimum 2). @default 3 */
  count?: number
  /** Fold axis. @default 'horizontal' */
  direction?: FoldPageDirection
  /** Structural fold geometry: multi-panel concertina (`accordion`) or cover wings (`gate`). @default 'accordion' */
  foldStyle?: FoldPageStyle
  /** Fold angle in degrees when closed (defaults to `68` for `accordion`, `172` for `gate`). */
  foldAngle?: number
  /** CSS 3D perspective distance in px. @default 1400 */
  perspective?: number
  /** Crease lighting and shadow strength (`0` to `1`). @default 0.28 */
  creaseOpacity?: number
  /** Surface mode passed to `TxBaseSurface`. @default 'refraction' */
  surface?: BaseSurfaceMode
  /** Optional surface base tint color. @default '' */
  surfaceColor?: string
  /** Surface base opacity (`0` to `1`). Defaults to `0.78` (`accordion`) or `0.94` (`gate`). */
  surfaceOpacity?: number
  /** Component size tier. @default 'md' */
  size?: FoldPageSize
  /** Outer corner radius in px. @default 16 */
  radius?: number
  /** Allow pointer drag to scrub fold progress. @default true */
  draggable?: boolean
  /** Allow clicking non-interactive panel areas to toggle. @default true */
  clickToToggle?: boolean
  /** Spring stiffness for settle motion. @default 220 */
  stiffness?: number
  /** Spring damping for settle motion. @default 24 */
  damping?: number
  /** Disable pointer and keyboard toggling. @default false */
  disabled?: boolean
  /** Accessible region label. @default 'Fold page' */
  ariaLabel?: string
  /** Override built-in toggle button labels. */
  labels?: FoldPageLabels
}

export interface FoldPageEmits {
  (e: 'update:modelValue', value: boolean): void
  (e: 'update:progress', progress: number): void
  (e: 'change', value: boolean): void
  (e: 'fold-start', to: boolean): void
  (e: 'fold-end', value: boolean): void
}

export interface FoldPagePanelSlotProps {
  panel: FoldPagePanel
  index: number
  count: number
  progress: number
  angle: number
  open: boolean
}

export interface FoldCornerLabels {
  peel?: string
  flatten?: string
  toggle?: string
}

export interface FoldCornerProps {
  /** Whether the corner is peeled open. Bind with `v-model`. @default false */
  modelValue?: boolean
  /** Continuous peel amount `0` (flat) to `1` (peeled across). Bind with `v-model:progress`. */
  progress?: number
  /** Active corner to peel from. @default 'bottom-right' */
  corner?: FoldCornerPosition
  /** Interaction mode. @default 'hover-drag' */
  trigger?: FoldCornerTrigger
  /** Subtle dog-ear curl while at rest (`0` to `1`). @default 0.12 */
  restPeel?: number
  /** Curl depth when hovered (`0` to `1`). @default 0.28 */
  hoverPeel?: number
  /** Target peel depth when opened (`0` to `1`). @default 0.84 */
  openPeel?: number
  /** Surface mode passed to `TxBaseSurface`. @default 'refraction' */
  surface?: BaseSurfaceMode
  /** Optional surface base tint color. @default '' */
  surfaceColor?: string
  /** Surface base opacity (`0` to `1`). @default 0.96 */
  surfaceOpacity?: number
  /** Component size tier. @default 'md' */
  size?: FoldPageSize
  /** Outer corner radius in px. @default 16 */
  radius?: number
  /** Crease highlight and drop-shadow strength (`0` to `1`). @default 0.26 */
  creaseOpacity?: number
  /** Spring stiffness for peel motion. @default 240 */
  stiffness?: number
  /** Spring damping for peel motion. @default 26 */
  damping?: number
  /** Disable hover, drag, click, and keyboard peeling. @default false */
  disabled?: boolean
  /** Accessible region label. @default 'Fold corner' */
  ariaLabel?: string
  /** Override corner handle labels. */
  labels?: FoldCornerLabels
}

export interface FoldCornerEmits {
  (e: 'update:modelValue', value: boolean): void
  (e: 'update:progress', progress: number): void
  (e: 'change', value: boolean): void
  (e: 'peel-start', to: boolean): void
  (e: 'peel-end', value: boolean): void
}

export interface FoldCornerSlotProps {
  progress: number
  peeled: boolean
  corner: FoldCornerPosition
  angleDeg: number
  toggle: () => void
}
