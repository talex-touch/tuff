// Adapted from Cloudflare kumo (https://github.com/cloudflare/kumo), © Cloudflare, Inc.,
// MIT — packages/kumo/src/components/chart/Color.ts. API kept name-compatible so
// kumo chart snippets translate directly.
//
// Components never call this module: they read the `--tx-chart-*` CSS variables
// (src/style/tokens.scss) and follow the host theme automatically. This literal
// table exists for consumers that need hex strings outside a chart — matching
// series colors in surrounding UI, exporting images, canvas contexts.

const CATEGORICAL_LIGHT = ['#4290F0', '#F5B647', '#E8649D', '#8D58EE', '#50C3B6', '#D37536'] as const
const CATEGORICAL_DARK = ['#4290F0', '#EEB720', '#E8649D', '#8D58EE', '#50C3B6', '#D37536'] as const

/** Ordered categorical colors (light mode), indexed by series position. */
export const CHART_LIGHT_COLORS: readonly string[] = CATEGORICAL_LIGHT

/** Ordered categorical colors (dark mode), indexed by series position. */
export const CHART_DARK_COLORS: readonly string[] = CATEGORICAL_DARK

export type ChartSemanticColorName
  = 'Attention' | 'Warning' | 'Success' | 'Neutral' | 'Disabled' | 'Skeleton'

const SEMANTIC_LIGHT: Record<ChartSemanticColorName, string> = {
  Attention: '#FC574A',
  Warning: '#F8A054',
  Success: '#00A63E',
  Neutral: '#B9D6FF',
  Disabled: '#CBCBCB',
  Skeleton: '#DDDDDD',
}

const SEMANTIC_DARK: Record<ChartSemanticColorName, string> = {
  Attention: '#FC574A',
  Warning: '#F8A054',
  Success: '#00A63E',
  Neutral: '#8EC5FF',
  Disabled: '#878787',
  Skeleton: '#5C5C5C',
}

const SEQUENTIAL_LIGHT = {
  blues: ['#E1EAF4', '#8EBCF6', '#4290F0', '#0E58B4', '#03254F'],
} as const

const SEQUENTIAL_DARK = {
  blues: ['#03254F', '#0E58B4', '#4290F0', '#A6BFDD', '#E1EAF4'],
} as const

export type ChartSequentialPaletteName = keyof typeof SEQUENTIAL_LIGHT

const TEXT_COLORS = {
  light: { primary: '#6B7280', secondary: '#9CA3AF' },
  dark: { primary: '#9CA3AF', secondary: '#6B7280' },
} as const

const MAP_AREA = { light: '#E5E7EB', dark: '#2B2C31' } as const

const MAP_SCALE = {
  light: ['#C8DEFB', '#8FBDF6', '#4290F0', '#1E60BE', '#0A3A7A'],
  dark: ['#26456C', '#2C68BE', '#4290F0', '#79AEF4', '#BBD6FA'],
} as const

/** Colors for GeoJSON-based map charts. */
export interface MapColors {
  /** Fill for land / no-data regions. */
  area: string
  /** Default bubble fill (the chart palette blue). */
  bubble: string
  /** Sequential ramp (low → high) for shading choropleth regions. */
  scale: string[]
}

/**
 * Chart color utilities resolved by semantic name or series index.
 * Every function takes an `isDarkMode` flag and returns a literal color string.
 */
export const ChartPalette = {
  /** Hex color for a named semantic value (status, severity, etc.). */
  semantic(name: ChartSemanticColorName, isDarkMode = false): string {
    return isDarkMode ? SEMANTIC_DARK[name] : SEMANTIC_LIGHT[name]
  },

  /**
   * Categorical color for a series index. Wraps around via modulo when the
   * index exceeds the palette length (6 colors).
   */
  categorical(index: number, isDarkMode = false): string {
    const colors = isDarkMode ? CATEGORICAL_DARK : CATEGORICAL_LIGHT
    // Palette length is a non-zero constant, so the modulo index always hits.
    return colors[index % colors.length] as string
  },

  /**
   * The same categorical slot as a CSS custom-property reference
   * (`var(--tx-chart-categorical-N, #hex)`), for templates and inline styles
   * that should follow the host theme instead of a fixed mode.
   */
  categoricalVar(index: number): string {
    const slot = (index % CATEGORICAL_LIGHT.length) + 1
    return `var(--tx-chart-categorical-${slot}, ${CATEGORICAL_LIGHT[slot - 1]})`
  },

  /** All steps of a named sequential palette (low → high) as a fresh array. */
  sequential(palette: ChartSequentialPaletteName, isDarkMode = false): string[] {
    return isDarkMode ? [...SEQUENTIAL_DARK[palette]] : [...SEQUENTIAL_LIGHT[palette]]
  },

  /** Hex color for chart text/labels. */
  text(variant: 'primary' | 'secondary', isDarkMode = false): string {
    return isDarkMode ? TEXT_COLORS.dark[variant] : TEXT_COLORS.light[variant]
  },

  /** Colors for GeoJSON-based map charts. */
  mapColors(isDarkMode = false): MapColors {
    const mode = isDarkMode ? 'dark' : 'light'
    return {
      area: MAP_AREA[mode],
      bubble: ChartPalette.categorical(0, isDarkMode),
      scale: [...MAP_SCALE[mode]],
    }
  },
}
