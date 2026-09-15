import type { IconInput, MorphHandle, MorphOptions, ReducedMotionMode, SpringPreset } from './engine'

export const BUILTIN_MORPH_ICONS: Record<string, string> = {
  'menu': 'M4 6h16M4 12h16M4 18h16',
  'close': 'M18 6 6 18M6 6l12 12',
  'x': 'M18 6 6 18M6 6l12 12',
  'plus': 'M5 12h14M12 5v14',
  'minus': 'M5 12h14',
  'check': 'M20 6 9 17l-5-5',
  'arrow-right': 'M5 12h14M12 5l7 7-7 7',
  'arrow-down': 'M12 5v14M19 12l-7 7-7-7',
  'arrow-left': 'M19 12H5M12 19l-7-7 7-7',
  'arrow-up': 'M12 19V5M5 12l7-7 7 7',
  'chevron-down': 'M6 9l6 6 6-6',
  'chevron-up': 'M18 15l-6-6-6 6',
  'chevron-right': 'M9 18l6-6-6-6',
  'chevron-left': 'M15 18l-6-6 6-6',
  'search': 'M10 2a8 8 0 105.293 14.293l4.707 4.707 1.414-1.414-4.707-4.707A8 8 0 0010 2zm0 2a6 6 0 110 12 6 6 0 010-12z',
  'user': 'M12 12a5 5 0 100-10 5 5 0 000 10zm0 2c-4.418 0-8 2.239-8 5v1h16v-1c0-2.761-3.582-5-8-5z',
  'star': 'M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.62L12 2 9.19 8.62 2 9.24l5.46 4.73L5.82 21z',
  'star-half': 'M12 2v15.77L6.08 21l1.82-7.03L2 9.24l7.19-.62L12 2z',
  'info': 'M12 2a10 10 0 100 20 10 10 0 000-20zm0 2a8 8 0 110 16 8 8 0 010-16zm-1 3h2v2h-2V7zm0 4h2v6h-2v-6z',
  'check-circle': 'M12 2a10 10 0 100 20 10 10 0 000-20zm0 2a8 8 0 110 16 8 8 0 010-16zm-1.3 12.3L6.4 12l1.4-1.4 2.9 2.9 5.6-5.6 1.4 1.4z',
  'x-circle': 'M12 2a10 10 0 100 20 10 10 0 000-20zm0 2a8 8 0 110 16 8 8 0 010-16zm3.5 4.1L12 11.6 8.5 8.1 7.1 9.5l3.5 3.5-3.5 3.5 1.4 1.4 3.5-3.5 3.5 3.5 1.4-1.4-3.5-3.5 3.5-3.5z',
  'alert-triangle': 'M12 2 1.5 20.5h21zm0 4.2L19 18.5H5zm-1 3.8h2v4.5h-2zm0 5.8h2v2h-2z',
}

export type MorphIconSource = IconInput | string

export interface IconMorphProps {
  /** Uncontrolled mode: the current icon; changing the prop animates. */
  icon?: MorphIconSource
  /** Controlled mode: source endpoint of the pair. */
  from?: MorphIconSource
  /** Controlled mode: target endpoint of the pair. */
  to?: MorphIconSource
  /** Controlled mode: 0..1 progress of the frozen morph (no spring). */
  progress?: number
  /** Physics for uncontrolled/imperative mode: preset or custom spring. */
  spring?: SpringPreset | MorphOptions
  /** Reduced-motion policy: "never" (default), "user" (honors OS preference), "always" (instant jump). */
  reducedMotion?: ReducedMotionMode
  /** Icon dimensions (width and height). Defaults to 24. */
  size?: number | string
  /** Stroke color. Defaults to "currentColor". */
  color?: string
  /** Stroke width. Defaults to 2. */
  strokeWidth?: number | string
  /** When true, stroke width does not scale with size (Lucide convention). */
  absoluteStrokeWidth?: boolean
  /** SVG viewBox. Defaults to "0 0 24 24". */
  viewBox?: string
  /** Accessibility label: when provided renders role="img" + <title>; otherwise aria-hidden="true". */
  label?: string
}

export type MorphIconProps = IconMorphProps
export type { MorphHandle }
