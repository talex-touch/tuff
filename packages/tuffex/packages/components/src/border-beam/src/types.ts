// Ported from border-beam/src/types.ts
// (https://github.com/Jakubantalik/Libraries). MIT License © 2026 Jakub Antalik.
// React-specific members (children/className/style/event callbacks) are dropped:
// Vue covers them through the default slot, attribute fallthrough and emits.

/**
 * Size/type preset for the border beam effect
 *
 * Rotate family (traveling/spinning beam):
 * - 'sm': Small button-sized with compact glow
 * - 'md': Medium card-sized with full border glow
 * - 'line': Bottom-only traveling glow with breathe and spike animations
 *
 * Pulse family (breathing glow, no rotation):
 * - 'pulse-outside': Glow blooms OUTWARD beyond the element (uncropped halo)
 * - 'pulse-inner': Glow breathes contained within the element's border
 */
export type BorderBeamSize = 'sm' | 'md' | 'line' | 'pulse-outside' | 'pulse-inner'

/**
 * Theme mode for adapting beam colors to background
 */
export type BorderBeamTheme = 'dark' | 'light' | 'auto'

/**
 * Color variant for the beam effect
 * - 'colorful': Full rainbow spectrum (default)
 * - 'mono': Monochromatic grayscale
 * - 'ocean': Blue and purple tones
 * - 'sunset': Warm orange, yellow, and red tones
 */
export type BorderBeamColorVariant = 'colorful' | 'mono' | 'ocean' | 'sunset'

/**
 * Configuration for a size preset
 */
export interface SizeConfig {
  borderRadius: number
  borderWidth: number
  width?: number
  height?: number
}

/**
 * Theme color configuration
 */
export interface ThemeColors {
  strokeOpacity: number
  innerOpacity: number
  bloomOpacity: number
  innerShadow: string
  saturation: number
  /** Optional per-type default brightness (used by pulse types). Falls back to 1.3. */
  brightness?: number
  /**
   * Optional opacity of the 1px hairline border that frames the element.
   * Used by 'pulse-outside' so the colored stroke rides a subtle outline,
   * matching the v5 prototype. Falls back to 0 (no hairline).
   */
  hairlineOpacity?: number
}

/**
 * Props for the TxBorderBeam component
 */
export interface BorderBeamProps {
  /**
   * Size/type preset
   * Rotate family: 'sm' (compact), 'md' (full border, default), 'line' (bottom traveling).
   * Pulse family: 'pulse-outside' (outward bloom), 'pulse-inner' (contained breathe).
   * @default 'md'
   */
  size?: BorderBeamSize

  /**
   * Color variant for the beam effect
   * @default 'colorful'
   */
  colorVariant?: BorderBeamColorVariant

  /**
   * Theme mode - adapts beam/glow colors for dark or light backgrounds.
   * 'auto' detects system preference via prefers-color-scheme.
   * @default 'dark'
   */
  theme?: BorderBeamTheme

  /**
   * Disable the hue-shift animation for static colors (e.g., monochrome)
   * @default false
   */
  staticColors?: boolean

  /**
   * Rotation/travel duration in seconds
   * @default 1.96 for border, 3.1 for line, 2.3 for pulse
   */
  duration?: number

  /**
   * Whether the animation is active
   * @default true
   */
  active?: boolean

  /**
   * Custom border radius in pixels. When omitted, the component
   * auto-detects the border-radius of the first slot element.
   * Falls back to the size preset default if detection fails.
   */
  borderRadius?: number

  /**
   * Brightness multiplier for the glow effect.
   * Falls back to the type's preset default (1.3 for most types).
   */
  brightness?: number

  /**
   * Saturation multiplier for the glow effect
   * @default 1.2 for dark, varies for light
   */
  saturation?: number

  /**
   * Hue rotation range in degrees for the hue-shift animation
   * @default 30
   */
  hueRange?: number

  /**
   * Overall strength/opacity of the effect (0-1).
   * Only affects the beam, glow, and bloom layers — not the slot content.
   * @default 1
   */
  strength?: number
}
