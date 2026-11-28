import type { TdsThemePack } from './types'
import { TDS_THEME_PACK_SCHEMA_VERSION } from './types'

export const TDS_DEFAULT_THEME_PACK_ID = 'tds-apple-neutral'

/**
 * 4 curated built-in TDS Theme Packs.
 *
 * Every light and dark ramp is verified against WCAG 2.1 sRGB relative luminance
 * with alpha compositing (opaque + `window-refraction` 0.85 translucency):
 *   - textPrimary / textRegular on bg & surface >= 4.5:1
 *   - onPrimary on primary >= 4.5:1
 *   - primary on bg >= 4.5:1 (exceeds 3.0:1 UI floor)
 *
 * Measured WCAG 2.1 contrast table (light / dark):
 *
 * 1. `tds-apple-neutral` (Baseline from `docs/design/tds/tokens.json`; light primary is stepped
 *    one luminance stop deeper along the same 211deg Apple blue hue — `#2b7fd9` -> `#2576cc` —
 *    so `#ffffff` `onPrimary` clears 4.62:1 >= 4.5:1 normal-text AA while the CoreApp desktop
 *    shell continues to clear overrides cleanly and inherit `shell-tokens.scss`):
 *    - light: textPrimary/bg 16.83, textPrimary/surface 15.72, textRegular/bg 9.12,
 *             textRegular/surface 8.52, onPrimary/primary 4.62, primary/bg 4.62
 *    - dark:  textPrimary/bg 16.92, textPrimary/surface 15.63, textRegular/bg 12.11,
 *             textRegular/surface 11.18, onPrimary/primary 5.24, primary/bg 6.22
 *
 * 2. `tds-obsidian-cobalt` (Cool slate light / deep carbon `#12141a` dark + calibrated cobalt):
 *    - light: textPrimary/bg 17.06, textPrimary/surface 16.30, textRegular/bg 9.90,
 *             textRegular/surface 9.45, onPrimary/primary 6.46, primary/bg 6.17
 *    - dark:  textPrimary/bg 16.80, textPrimary/surface 15.40, textRegular/bg 12.40,
 *             textRegular/surface 11.36, onPrimary/primary 6.85, primary/bg 7.25
 *
 * 3. `tds-paper-ink` (Warm parchment `#faf8f4` light / warm ink `#181715` dark + vermilion):
 *    - light: textPrimary/bg 16.00, textPrimary/surface 14.78, textRegular/bg 9.96,
 *             textRegular/surface 9.20, onPrimary/primary 5.39, primary/bg 5.08
 *    - dark:  textPrimary/bg 15.91, textPrimary/surface 14.60, textRegular/bg 11.59,
 *             textRegular/surface 10.63, onPrimary/primary 6.61, primary/bg 6.41
 *
 * 4. `tds-graphite-emerald` (Precision graphite `#f6f8f7` / `#131716` + calibrated emerald):
 *    - light: textPrimary/bg 15.72, textPrimary/surface 14.81, textRegular/bg 9.15,
 *             textRegular/surface 8.62, onPrimary/primary 5.35, primary/bg 5.01
 *    - dark:  textPrimary/bg 16.34, textPrimary/surface 14.95, textRegular/bg 12.12,
 *             textRegular/surface 11.10, onPrimary/primary 7.84, primary/bg 8.60
 */
export const TDS_APPLE_NEUTRAL_PACK: TdsThemePack = {
  schemaVersion: TDS_THEME_PACK_SCHEMA_VERSION,
  meta: {
    id: TDS_DEFAULT_THEME_PACK_ID,
    name: 'Apple Neutral',
    description:
      'Default Tuff neutral ramp with calibrated Apple blue accent and Refraction glass.',
    version: '1.0.0',
    author: 'Tuff Design System',
    builtIn: true,
  },
  tokens: {
    light: {
      bg: '#ffffff',
      surface: '#f7f7f8',
      surface2: '#efeff1',
      border: '#e5e5e5',
      borderStrong: '#d2d2d4',
      textPrimary: '#1d1d1f',
      textRegular: '#48484a',
      textSecondary: '#6e6e73',
      textMuted: '#8a8a8f',
      primary: '#2576cc',
      primarySoft: '#2576cc1a',
      primaryBorder: '#2576cc3d',
      onPrimary: '#ffffff',
      success: '#26794e',
      warning: '#946210',
      danger: '#c4342b',
      info: '#6e6e73',
      radiusSm: '6px',
      radiusMd: '10px',
      radiusLg: '14px',
    },
    dark: {
      bg: '#141414',
      surface: '#1c1c1e',
      surface2: '#2c2c2e',
      border: '#333335',
      borderStrong: '#48484a',
      textPrimary: '#f5f5f7',
      textRegular: '#d1d1d6',
      textSecondary: '#aeaeb2',
      textMuted: '#8a8a8e',
      primary: '#4e9ae6',
      primarySoft: '#4e9ae626',
      primaryBorder: '#4e9ae64d',
      onPrimary: '#0a2540',
      success: '#46b57c',
      warning: '#d9a441',
      danger: '#e0655c',
      info: '#98989d',
      radiusSm: '6px',
      radiusMd: '10px',
      radiusLg: '14px',
    },
  },
  material: {
    windowPreference: 'refraction',
    motionPreset: 'full',
    liveClockFps: 11,
  },
  surface: {
    canvasPattern: 'dots',
    accentTintOpacity: 0.1,
    cornerHighlight: true,
  },
}

export const TDS_OBSIDIAN_COBALT_PACK: TdsThemePack = {
  schemaVersion: TDS_THEME_PACK_SCHEMA_VERSION,
  meta: {
    id: 'tds-obsidian-cobalt',
    name: 'Obsidian Studio',
    description: 'Cool slate light and deep carbon dark surfaces paired with calibrated cobalt.',
    version: '1.0.0',
    author: 'Tuff Design System',
    builtIn: true,
  },
  tokens: {
    light: {
      bg: '#f8fafc',
      surface: '#f1f5f9',
      surface2: '#e2e8f0',
      border: '#dbe3ee',
      borderStrong: '#c3d0e0',
      textPrimary: '#0f172a',
      textRegular: '#334155',
      textSecondary: '#475569',
      textMuted: '#64748b',
      primary: '#2452d6',
      primarySoft: '#2452d61a',
      primaryBorder: '#2452d63d',
      onPrimary: '#ffffff',
      success: '#1b734c',
      warning: '#945f0c',
      danger: '#c4302b',
      info: '#475569',
      radiusSm: '6px',
      radiusMd: '10px',
      radiusLg: '14px',
    },
    dark: {
      bg: '#12141a',
      surface: '#191d26',
      surface2: '#232936',
      border: '#2e3647',
      borderStrong: '#414c63',
      textPrimary: '#f1f5f9',
      textRegular: '#cbd5e1',
      textSecondary: '#94a3b8',
      textMuted: '#7e8da3',
      primary: '#6ea2ff',
      primarySoft: '#6ea2ff26',
      primaryBorder: '#6ea2ff4d',
      onPrimary: '#091938',
      success: '#4bc48a',
      warning: '#e0ad48',
      danger: '#f07167',
      info: '#94a3b8',
      radiusSm: '6px',
      radiusMd: '10px',
      radiusLg: '14px',
    },
  },
  material: {
    windowPreference: 'refraction',
    motionPreset: 'crisp',
    liveClockFps: 11,
  },
  surface: {
    canvasPattern: 'grid',
    accentTintOpacity: 0.12,
    cornerHighlight: true,
  },
}

export const TDS_PAPER_INK_PACK: TdsThemePack = {
  schemaVersion: TDS_THEME_PACK_SCHEMA_VERSION,
  meta: {
    id: 'tds-paper-ink',
    name: 'Editorial Paper',
    description: 'Warm parchment and warm ink tones with vermilion accent and pure surface.',
    version: '1.0.0',
    author: 'Tuff Design System',
    builtIn: true,
  },
  tokens: {
    light: {
      bg: '#faf8f4',
      surface: '#f2efe8',
      surface2: '#e8e3d9',
      border: '#dfd8cb',
      borderStrong: '#c9bfb0',
      textPrimary: '#1f1c18',
      textRegular: '#443e36',
      textSecondary: '#625a4f',
      textMuted: '#7c7265',
      primary: '#b94326',
      primarySoft: '#b943261a',
      primaryBorder: '#b943263d',
      onPrimary: '#ffffff',
      success: '#2a754c',
      warning: '#8f5c0f',
      danger: '#bd2f28',
      info: '#625a4f',
      radiusSm: '4px',
      radiusMd: '8px',
      radiusLg: '12px',
    },
    dark: {
      bg: '#181715',
      surface: '#211f1c',
      surface2: '#2d2a26',
      border: '#3a3630',
      borderStrong: '#524c44',
      textPrimary: '#f5f1ea',
      textRegular: '#d6cfc4',
      textSecondary: '#aea598',
      textMuted: '#8e8579',
      primary: '#eb7b5a',
      primarySoft: '#eb7b5a26',
      primaryBorder: '#eb7b5a4d',
      onPrimary: '#260c05',
      success: '#56be84',
      warning: '#dfb04c',
      danger: '#eb6d62',
      info: '#a89f92',
      radiusSm: '4px',
      radiusMd: '8px',
      radiusLg: '12px',
    },
  },
  material: {
    windowPreference: 'pure',
    motionPreset: 'crisp',
    liveClockFps: 10,
  },
  surface: {
    canvasPattern: 'paper-grain',
    accentTintOpacity: 0.08,
    cornerHighlight: false,
  },
}

export const TDS_GRAPHITE_EMERALD_PACK: TdsThemePack = {
  schemaVersion: TDS_THEME_PACK_SCHEMA_VERSION,
  meta: {
    id: 'tds-graphite-emerald',
    name: 'Precision Terminal',
    description: 'High-legibility graphite surfaces with calibrated emerald accent.',
    version: '1.0.0',
    author: 'Tuff Design System',
    builtIn: true,
  },
  tokens: {
    light: {
      bg: '#f6f8f7',
      surface: '#edf2ef',
      surface2: '#e1e9e4',
      border: '#d4dfd8',
      borderStrong: '#b8c9bf',
      textPrimary: '#14201b',
      textRegular: '#354840',
      textSecondary: '#4f665c',
      textMuted: '#687f75',
      primary: '#0e7a53',
      primarySoft: '#0e7a531a',
      primaryBorder: '#0e7a533d',
      onPrimary: '#ffffff',
      success: '#157046',
      warning: '#8a580a',
      danger: '#c2332a',
      info: '#4f665c',
      radiusSm: '6px',
      radiusMd: '10px',
      radiusLg: '14px',
    },
    dark: {
      bg: '#131716',
      surface: '#1a201e',
      surface2: '#252e2b',
      border: '#303c38',
      borderStrong: '#44554f',
      textPrimary: '#eef5f2',
      textRegular: '#c8d7d0',
      textSecondary: '#9cb0a7',
      textMuted: '#7f948b',
      primary: '#3ec995',
      primarySoft: '#3ec99526',
      primaryBorder: '#3ec9954d',
      onPrimary: '#062419',
      success: '#4fd19b',
      warning: '#e0b048',
      danger: '#ec6f66',
      info: '#96aaa1',
      radiusSm: '6px',
      radiusMd: '10px',
      radiusLg: '14px',
    },
  },
  material: {
    windowPreference: 'refraction',
    motionPreset: 'crisp',
    liveClockFps: 11,
  },
  surface: {
    canvasPattern: 'dots',
    accentTintOpacity: 0.1,
    cornerHighlight: true,
  },
}

export const TDS_DEFAULT_THEME_PACK: TdsThemePack = TDS_APPLE_NEUTRAL_PACK

export const TDS_THEME_PACKS: readonly TdsThemePack[] = Object.freeze([
  TDS_APPLE_NEUTRAL_PACK,
  TDS_OBSIDIAN_COBALT_PACK,
  TDS_PAPER_INK_PACK,
  TDS_GRAPHITE_EMERALD_PACK,
])

export function getBuiltInThemePack(id: string): TdsThemePack | undefined {
  return TDS_THEME_PACKS.find(pack => pack.meta.id === id)
}
