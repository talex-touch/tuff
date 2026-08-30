/** The theme's choropleth ramp as CSS var() references (light fallbacks). */
export const DEFAULT_MAP_SCALE_VARS = [
  'var(--tx-chart-map-scale-1, #C8DEFB)',
  'var(--tx-chart-map-scale-2, #8FBDF6)',
  'var(--tx-chart-map-scale-3, #4290F0)',
  'var(--tx-chart-map-scale-4, #1E60BE)',
  'var(--tx-chart-map-scale-5, #0A3A7A)',
]

/**
 * Continuous ramp color for a normalized `t` in [0, 1]: interpolates between
 * the two surrounding ramp stops with CSS `color-mix` in OKLab, so the fill
 * follows the host theme with zero JS color parsing.
 */
export function rampColor(t: number, range: string[] = DEFAULT_MAP_SCALE_VARS): string {
  if (range.length === 0)
    return 'transparent'
  if (range.length === 1)
    return range[0] as string
  const clamped = Math.max(0, Math.min(1, t))
  const segment = clamped * (range.length - 1)
  const index = Math.min(range.length - 2, Math.floor(segment))
  const fraction = segment - index
  const from = range[index] as string
  const to = range[index + 1] as string
  if (fraction <= 0)
    return from
  if (fraction >= 1)
    return to
  return `color-mix(in oklab, ${from}, ${to} ${Math.round(fraction * 100)}%)`
}

/** CSS gradient string for the legend bar matching a ramp. */
export function rampGradient(range: string[] = DEFAULT_MAP_SCALE_VARS): string {
  return `linear-gradient(to right, ${range.join(', ')})`
}
