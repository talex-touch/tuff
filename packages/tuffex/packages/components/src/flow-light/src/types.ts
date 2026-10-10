/**
 * How the flow light is drawn:
 *
 * - `corners` — two soft glows on the top corners, warm on the left and cool on the right.
 * - `rim` — a hairline of the brand gradient along the top edge, fading down the panel.
 * - `aurora` — four blurred blooms around the edges, a faint tint across the whole surface.
 */
export type FlowLightVariant = 'corners' | 'rim' | 'aurora'

export interface FlowLightProps {
  /** How the light is drawn. */
  variant?: FlowLightVariant
  /** Multiplies the theme's opacity for the variant; `0` hides the light. */
  intensity?: number
  /**
   * Up to four colours replacing the Tuff brand stops, in order: blue `#0894ff`, purple `#c959dd`,
   * red `#ff2e54`, orange `#ff9004`. A missing entry keeps its default.
   */
  colors?: readonly string[]
}
