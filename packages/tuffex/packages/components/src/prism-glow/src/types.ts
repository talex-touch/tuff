/**
 * Colour source for the cones.
 * - `spectrum`: six hues spread across the whole wheel
 * - `accent`: six neighbouring hues derived from `--tx-color-primary`
 */
export type PrismGlowPalette = 'spectrum' | 'accent'

/** The edge the cones rise from. They travel left to right either way. */
export type PrismGlowPlacement = 'bottom' | 'top'

export interface PrismGlowProps {
  /**
   * Shows the glow. Turning it off fades the light layer out and then unmounts it,
   * so nothing keeps animating while it is off.
   * @default true
   */
  active?: boolean

  /**
   * Full spectrum, or hues derived from `--tx-color-primary`.
   * @default 'spectrum'
   */
  palette?: PrismGlowPalette

  /**
   * The edge the light rises from.
   * @default 'bottom'
   */
  placement?: PrismGlowPlacement

  /**
   * Opacity of the light layer, 0–1; values outside are clamped. The slot content is unaffected.
   * @default 1
   */
  intensity?: number

  /**
   * Base flow period in seconds; smaller is faster. Each cone runs its own multiple of it.
   * Values that are not a positive number fall back to the default.
   * @default 6
   */
  duration?: number

  /**
   * Retracts the light the moment the watched box grows taller (by more than 8px, so a font
   * swap's reflow does not count), instead of fading it out:
   * content arriving under a loading surface should not share the frame with the glow. Growth
   * during a fade-out retracts it the same way. It stays off until `active` is switched off and
   * on again. Shrinking never triggers it.
   * @default true
   */
  collapseOnGrow?: boolean

  /**
   * The element whose height `collapseOnGrow` watches. Defaults to the component root, which
   * is the host in both the wrapper and the overlay usage. Point it at an outer container when
   * the glow sits in a part of it that never grows, such as a fixed-height header.
   */
  growTarget?: HTMLElement | null
}
