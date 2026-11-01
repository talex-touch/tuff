export const NERD_FONT_FALLBACK_STACK: readonly string[] = Object.freeze([
  '"Symbols Nerd Font Mono"',
  '"Symbols Nerd Font"',
  '"Maple Mono NF CN"',
  '"Maple Mono NF"',
  '"JetBrainsMono Nerd Font"',
  '"FiraCode Nerd Font"',
  '"MesloLGS NF"',
  'ui-monospace',
  'SFMono-Regular',
  '"JetBrains Mono"',
  'Menlo',
  'Monaco',
  'Consolas',
  'monospace',
])

export const DEFAULT_TERMINAL_FONT_FAMILY: string = [
  'ui-monospace',
  'SFMono-Regular',
  '"JetBrains Mono"',
  'Menlo',
  'Monaco',
  'Consolas',
  ...NERD_FONT_FALLBACK_STACK.slice(0, 7),
  'monospace',
].join(', ')

/**
 * Resolves a terminal font-family stack ensuring that Nerd Font PUA icons
 * are never left un-rendered (tofu / []) when a user selects a primary font
 * that lacks patched glyphs.
 */
export function resolveTerminalFontFamily(userFont?: string | null): string {
  const trimmed = userFont?.trim()
  if (!trimmed || trimmed.toLowerCase() === 'default') {
    return DEFAULT_TERMINAL_FONT_FAMILY
  }

  const userFonts = trimmed
    .split(',')
    .map(f => f.trim())
    .filter(Boolean)

  const combined = [...userFonts, ...NERD_FONT_FALLBACK_STACK]
  const seen = new Set<string>()
  const result: string[] = []

  for (const font of combined) {
    const unquoted = font.replace(/^['"]|['"]$/g, '').toLowerCase()
    if (!seen.has(unquoted)) {
      seen.add(unquoted)
      result.push(font)
    }
  }

  return result.join(', ')
}
