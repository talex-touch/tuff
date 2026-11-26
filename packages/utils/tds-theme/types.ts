/**
 * TDS Theme Pack — Shiki-inspired 3-layer pure declarative theme schema.
 *
 * Security & architecture contract:
 *   - 100% static pure data (tokens, material preferences, surface hints), ZERO DOM/Vue dependency.
 *   - ZERO Region/component injection, ZERO arbitrary CSS selectors, ZERO JS execution.
 *   - Every token maps strictly to a whitelisted `--shell-*` CSS custom property.
 *   - High-contrast accessibility ramps (`html.contrast`, `html.dark.contrast`) always win.
 */

export const TDS_THEME_PACK_SCHEMA_VERSION = 1 as const
export const TDS_PLUGIN_THEME_PACK_MANIFEST_VERSION = 1 as const
export const TDS_PLUGIN_THEME_PACK_MANIFEST_KIND = 'tds-theme-pack' as const

export const TDS_THEME_COLOR_TOKEN_KEYS = [
  'bg',
  'surface',
  'surface2',
  'border',
  'borderStrong',
  'textPrimary',
  'textRegular',
  'textSecondary',
  'textMuted',
  'primary',
  'primarySoft',
  'primaryBorder',
  'onPrimary',
  'success',
  'warning',
  'danger',
  'info',
] as const

export const TDS_THEME_RADIUS_TOKEN_KEYS = ['radiusSm', 'radiusMd', 'radiusLg'] as const

export type TdsThemeColorTokenKey = (typeof TDS_THEME_COLOR_TOKEN_KEYS)[number]
export type TdsThemeRadiusTokenKey = (typeof TDS_THEME_RADIUS_TOKEN_KEYS)[number]
export type TdsThemeTokenKey = TdsThemeColorTokenKey | TdsThemeRadiusTokenKey

export const TDS_THEME_TOKEN_KEYS: readonly TdsThemeTokenKey[] = [
  ...TDS_THEME_COLOR_TOKEN_KEYS,
  ...TDS_THEME_RADIUS_TOKEN_KEYS,
]

export const TDS_THEME_TOKEN_CSS_VAR_MAP: Readonly<Record<TdsThemeTokenKey, string>>
  = Object.freeze({
    bg: '--shell-bg',
    surface: '--shell-surface',
    surface2: '--shell-surface-2',
    border: '--shell-border',
    borderStrong: '--shell-border-strong',
    textPrimary: '--shell-text-primary',
    textRegular: '--shell-text-regular',
    textSecondary: '--shell-text-secondary',
    textMuted: '--shell-text-muted',
    primary: '--shell-primary',
    primarySoft: '--shell-primary-soft',
    primaryBorder: '--shell-primary-border',
    onPrimary: '--shell-on-primary',
    success: '--shell-success',
    warning: '--shell-warning',
    danger: '--shell-danger',
    info: '--shell-info',
    radiusSm: '--shell-radius-sm',
    radiusMd: '--shell-radius-md',
    radiusLg: '--shell-radius-lg',
  })

export type TdsThemeTokenOverrides = Partial<Record<TdsThemeTokenKey, string>>

export type TdsThemeWindowPreference = 'pure' | 'refraction' | 'filter'
export type TdsThemeMotionPreset = 'full' | 'crisp' | 'reduced'
export type TdsThemeCanvasPattern = 'none' | 'dots' | 'grid' | 'paper-grain'

export interface TdsThemePackMeta {
  id: string
  name: string
  description: string
  version: string
  author: string
  builtIn?: boolean
}

export interface TdsThemePackMaterial {
  windowPreference?: TdsThemeWindowPreference
  motionPreset?: TdsThemeMotionPreset
  liveClockFps?: number
}

export interface TdsThemePackSurface {
  canvasPattern?: TdsThemeCanvasPattern
  accentTintOpacity?: number
  cornerHighlight?: boolean
}

export interface TdsThemePack {
  schemaVersion: typeof TDS_THEME_PACK_SCHEMA_VERSION
  meta: TdsThemePackMeta
  tokens: {
    light: TdsThemeTokenOverrides
    dark: TdsThemeTokenOverrides
  }
  material?: TdsThemePackMaterial
  surface?: TdsThemePackSurface
}

export interface TdsContrastCheckResult {
  id: string
  mode: 'light' | 'dark'
  fgToken: TdsThemeColorTokenKey
  bgToken: TdsThemeColorTokenKey
  backdropToken?: TdsThemeColorTokenKey
  fgValue: string
  bgValue: string
  ratio: number
  minRatio: number
  passed: boolean
}

export interface TdsThemeContrastReport {
  light: TdsContrastCheckResult[]
  dark: TdsContrastCheckResult[]
  minLightRatio: number
  minDarkRatio: number
  passed: boolean
}

export interface TdsThemeValidationOptions {
  /** Also enforce WCAG AA >= 4.5:1 under window-refraction 0.85 translucency (default true). */
  checkRefraction?: boolean
}

export interface TdsThemeValidationResult {
  valid: boolean
  errors: string[]
  contrastReport: TdsThemeContrastReport
  pack?: TdsThemePack
}

export interface TdsPluginThemePackManifestEnvelope {
  manifestVersion?: typeof TDS_PLUGIN_THEME_PACK_MANIFEST_VERSION
  kind: typeof TDS_PLUGIN_THEME_PACK_MANIFEST_KIND
  pack: TdsThemePack
}

export interface ParsePluginThemePackManifestOptions {
  /** Allow built-in preset IDs (default false so third-party plugins/store packs cannot spoof built-ins). */
  allowBuiltInId?: boolean
  /** Maximum UTF-8 byte length for JSON string manifests (default 64 KiB). */
  maxBytes?: number
  /** Enforce Refraction 0.85 contrast checks in addition to opaque WCAG AA (default true). */
  checkRefraction?: boolean
}

export interface TdsPluginThemePackManifestResult extends TdsThemeValidationResult {
  /** Safe exported CSS guarded by `:not(.contrast)` when valid. */
  css?: string
}
