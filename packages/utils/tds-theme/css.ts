import type { TdsThemePack, TdsThemeTokenOverrides } from './types'
import { TDS_DEFAULT_THEME_PACK } from './presets'
import { TDS_THEME_TOKEN_CSS_VAR_MAP, TDS_THEME_TOKEN_KEYS } from './types'
import { validateTdsThemePack } from './validator'

const SIX_DIGIT_HEX_PATTERN = /^#[0-9a-f]{6}$/i
const SEMANTIC_DERIVED_KEYS = ['success', 'warning', 'danger', 'info'] as const

export function cloneThemePack(pack: TdsThemePack): TdsThemePack {
  return {
    schemaVersion: pack.schemaVersion,
    meta: { ...pack.meta },
    tokens: {
      light: { ...pack.tokens.light },
      dark: { ...pack.tokens.dark },
    },
    ...(pack.material ? { material: { ...pack.material } } : {}),
    ...(pack.surface ? { surface: { ...pack.surface } } : {}),
  }
}

function buildTokenDeclarations(
  overrides: TdsThemeTokenOverrides,
  mode: 'light' | 'dark',
): string[] {
  const lines: string[] = []
  const softAlpha = mode === 'light' ? '14' : '26'
  const borderAlpha = mode === 'light' ? '3d' : '4d'

  for (const key of TDS_THEME_TOKEN_KEYS) {
    const value = overrides[key]
    if (!value)
      continue
    const cssVar = TDS_THEME_TOKEN_CSS_VAR_MAP[key]
    lines.push(`  ${cssVar}: ${value};`)
  }

  if (overrides.primary) {
    lines.push(`  --shell-focus-ring: ${overrides.primary};`)
  }

  for (const semanticKey of SEMANTIC_DERIVED_KEYS) {
    const baseHex = overrides[semanticKey]
    if (baseHex && SIX_DIGIT_HEX_PATTERN.test(baseHex)) {
      lines.push(`  --shell-${semanticKey}-soft: ${baseHex}${softAlpha};`)
      lines.push(`  --shell-${semanticKey}-border: ${baseHex}${borderAlpha};`)
    }
  }

  return lines
}

/**
 * Exports a validated TDS Theme Pack into a safe, deterministic, zero-DOM CSS block.
 *
 * Uses `:root:not(.contrast)` and `.dark:not(.contrast)` so accessibility
 * high-contrast modes (`html.contrast` and `html.dark.contrast`) always win.
 */
export function exportThemePackAsCss(pack: TdsThemePack): string {
  const validation = validateTdsThemePack(pack)
  if (!validation.valid || !validation.pack) {
    return ''
  }

  const safePack = validation.pack
  const effectiveDark: TdsThemeTokenOverrides = { ...safePack.tokens.dark }
  for (const key of TDS_THEME_TOKEN_KEYS) {
    if (safePack.tokens.light[key] && !effectiveDark[key]) {
      const darkFallback = TDS_DEFAULT_THEME_PACK.tokens.dark[key]
      if (darkFallback) {
        effectiveDark[key] = darkFallback
      }
    }
  }

  const lightLines = buildTokenDeclarations(safePack.tokens.light, 'light')
  const darkLines = buildTokenDeclarations(effectiveDark, 'dark')

  if (typeof safePack.surface?.accentTintOpacity === 'number') {
    lightLines.push(`  --tds-accent-tint-opacity: ${safePack.surface.accentTintOpacity};`)
  }

  const blocks: string[] = [`/* TDS Theme Pack: ${safePack.meta.id} */`]

  if (lightLines.length > 0) {
    blocks.push(`:root:not(.contrast) {\n${lightLines.join('\n')}\n}`)
  }

  if (darkLines.length > 0) {
    blocks.push(`.dark:not(.contrast) {\n${darkLines.join('\n')}\n}`)
  }

  return blocks.join('\n\n')
}
