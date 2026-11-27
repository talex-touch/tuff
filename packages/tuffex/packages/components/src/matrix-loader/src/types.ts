export const MATRIX_LOADER_STATES = [
  'thinking',
  'searching',
  'exploring',
  'deciding',
  'generating',
  'extracting',
  'accelerating',
  'defining',
] as const

export type MatrixLoaderState = (typeof MATRIX_LOADER_STATES)[number]

export const MATRIX_LOADER_ERAS = [
  'oled',
  'crt',
  'vfd',
  'dither',
  'lcd',
] as const

export type MatrixLoaderEra = (typeof MATRIX_LOADER_ERAS)[number]

export const MATRIX_LOADER_SHAPES = [
  'quad',
  'circle',
  'diamond',
] as const

export type MatrixLoaderShape = (typeof MATRIX_LOADER_SHAPES)[number]

/** Standard TuffEx size tier; use `displaySize` for arbitrary pixel dimensions. */
export type MatrixLoaderSize = 'xs' | 'sm' | 'md' | 'lg'

export type MatrixLoaderTheme = 'auto' | 'dark' | 'light'

export type MatrixLoaderLabels = Partial<Record<MatrixLoaderState, string>>

export const MATRIX_LOADER_SIZE_PX: Record<MatrixLoaderSize, number> = {
  xs: 18,
  sm: 24,
  md: 40,
  lg: 64,
}

export const MATRIX_LOADER_DEFAULT_LABELS: Record<MatrixLoaderState, string> = {
  thinking: 'Thinking',
  searching: 'Searching',
  exploring: 'Exploring',
  deciding: 'Deciding',
  generating: 'Generating',
  extracting: 'Extracting',
  accelerating: 'Accelerating',
  defining: 'Defining',
}

/** Exact measured loop durations in seconds for each semantic state. */
export const MATRIX_LOADER_PERIODS: Record<MatrixLoaderState, number> = {
  thinking: 81 / 60,
  searching: 90 / 60,
  exploring: 126 / 60,
  deciding: 126 / 60,
  generating: 156 / 60,
  extracting: 96 / 60,
  accelerating: 60 / 60,
  defining: 96 / 60,
}

export interface MatrixLoaderProps {
  /** Semantic AI phase controlling the underlying mathematical field. @default 'thinking' */
  state?: MatrixLoaderState
  /** Standard size tier (`xs`=18px, `sm`=24px, `md`=40px, `lg`=64px). @default 'md' */
  size?: MatrixLoaderSize
  /** Explicit rendered width/height in CSS px; overrides `size`. */
  displaySize?: number
  /** Electronic display era shader & palette. @default 'oled' */
  era?: MatrixLoaderEra
  /** Geometric primitive drawn per matrix tile. @default 'quad' */
  shape?: MatrixLoaderShape
  /** Odd grid resolution (3, 5, 7, 9). @default 5 */
  gridSize?: number
  /** Spherical fisheye lens bulge factor (`0` = flat plane, `1` = spherical). @default 1 */
  bulge?: number
  /** Left-to-right halftone size gradient (`0` = uniform, `1` = full taper). @default 1 */
  taper?: number
  /** Tile fill scale relative to grid cell pitch (`0.45`–`1.25`). @default 1 */
  fill?: number
  /** Positive animation speed multiplier. @default 1 */
  speed?: number
  /** Motion amplitude multiplier (`0` = static rest mark, `1` = full motion). @default 1 */
  intensity?: number
  /** 2D gradient noise perturbation strength (`0` = pure analytic, `1` = strong organic drift). @default 0 */
  noise?: number
  /** Spatial frequency for the 2D noise field. @default 1.4 */
  noiseFrequency?: number
  /** Strength of scanline, phosphor glow, or dither quantization for non-OLED eras (`0`–`1`). @default 0.65 */
  fxStrength?: number
  /** Color theme; `'auto'` follows document dark/light mode. @default 'auto' */
  theme?: MatrixLoaderTheme
  /** Custom CSS ink color for `'oled'` era (e.g. `'#6366f1'`); falls back to theme ink. */
  color?: string
  /** Smooth crossfade duration in ms when `state` changes. @default 220 */
  transitionDuration?: number
  /** Pause the animation loop while keeping the current frame painted. @default false */
  paused?: boolean
  /** Deterministic timestamp in seconds; bypasses `requestAnimationFrame` when finite. */
  time?: number
  /** Explicit accessible/visible label; overrides `labels[state]`. */
  label?: string
  /** Per-state localized label overrides. */
  labels?: MatrixLoaderLabels
  /** Render the status label visually beneath the canvas. @default false */
  showLabel?: boolean
}
