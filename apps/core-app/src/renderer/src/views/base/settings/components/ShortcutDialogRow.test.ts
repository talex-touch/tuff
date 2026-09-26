import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const here = dirname(fileURLToPath(import.meta.url))

/**
 * The declarations of each rule in the row's own stylesheet, by selector, with multi-line values
 * collapsed onto one line. jsdom applies no SFC styles, so what a class resolves to is read from
 * the source it is declared in.
 */
function statusRules(): Map<string, Map<string, string>> {
  const source = readFileSync(resolve(here, 'ShortcutDialogRow.vue'), 'utf8')
  const css = [...source.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)]
    .map((match) => match[1] ?? '')
    .join('\n')
    .replace(/\/\*[\s\S]*?\*\//g, '')
  const rules = new Map<string, Map<string, string>>()
  for (const [, selectors, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const declarations = new Map<string, string>()
    for (const declaration of (body ?? '').split(';')) {
      const colon = declaration.indexOf(':')
      if (colon < 0) continue
      const value = declaration
        .slice(colon + 1)
        .replace(/\s+/g, ' ')
        .replace(/\( /g, '(')
      declarations.set(declaration.slice(0, colon).trim(), value.replace(/ \)/g, ')').trim())
    }
    for (const selector of selectors!.split(',')) {
      const key = selector.trim()
      rules.set(key, new Map([...(rules.get(key) ?? []), ...declarations]))
    }
  }
  return rules
}

function statusColors(): Map<string, string> {
  const colors = new Map<string, string>()
  for (const [selector, declarations] of statusRules()) {
    const color = declarations.get('color')
    if (color) colors.set(selector, color)
  }
  return colors
}

/** Hex from the `:root` (light) or `.dark` block of the tuffex tokens. */
function themeToken(block: ':root' | '.dark', token: string): string {
  const scss = readFileSync(
    resolve(
      here,
      '../../../../../../../../../packages/tuffex/packages/components/style/variables.scss'
    ),
    'utf8'
  )
  const start = scss.indexOf(`\n${block} {`)
  const end = scss.indexOf('\n}', start)
  const value = new RegExp(`${token}:\\s*(#[0-9a-f]{6});`, 'i').exec(scss.slice(start, end))?.[1]
  if (!value) throw new Error(`${token} not found in ${block}`)
  return value
}

type Rgb = [number, number, number]
const rgb = (hex: string): Rgb =>
  hex
    .slice(1)
    .match(/../g)!
    .map((pair) => parseInt(pair, 16)) as Rgb
/** `color-mix(in srgb, a p%, b)`: the gamma-encoded channels, interpolated. */
const mix = (a: Rgb, b: Rgb, share: number): Rgb =>
  a.map((channel, i) => channel * share + b[i]! * (1 - share)) as Rgb
function contrast(a: Rgb, b: Rgb): number {
  const luminance = (color: Rgb) => {
    const [r, g, bl] = color.map((channel) => {
      const c = channel / 255
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
    })
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * bl!
  }
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (light! + 0.05) / (dark! + 0.05)
}

/**
 * 12px status text needs 4.5:1. The plain hues and `secondary` read 2.24-3.08 on the white cell in
 * the light theme, so light themes mix each hue toward the primary ink (tuffex's same-hue recipe)
 * and read grey on `regular`; dark themes keep the plain tokens, which already clear it.
 */
describe('ShortcutDialogRow status ink contrast', () => {
  const recipes = {
    danger:
      'color-mix(in srgb, var(--tx-color-danger, #f56c6c) 55%, var(--tx-text-color-primary, #303133))',
    success:
      'color-mix(in srgb, var(--tx-color-success, #67c23a) 45%, var(--tx-text-color-primary, #303133))',
    muted: 'var(--tx-text-color-regular, #606266)'
  }

  it('mixes each hue toward the primary ink in the light theme, and reads grey on regular', () => {
    const light = statusRules().get('.ShortcutDialog-StatusText')!

    for (const [tone, recipe] of Object.entries(recipes)) {
      expect(light.get(`--shortcut-status-${tone}`), tone).toBe(recipe)
    }
    expect([...light.keys()].filter((name) => name.startsWith('--')).sort()).toEqual(
      Object.keys(recipes)
        .map((tone) => `--shortcut-status-${tone}`)
        .sort()
    )
  })

  it('keeps the plain tokens in the dark theme', () => {
    const dark = statusRules().get('.dark .ShortcutDialog-StatusText')!

    expect(Object.fromEntries(dark)).toEqual({
      '--shortcut-status-danger': 'var(--tx-color-danger)',
      '--shortcut-status-success': 'var(--tx-color-success)',
      '--shortcut-status-muted': 'var(--tx-text-color-secondary)'
    })
  })

  it('gives every status its tone', () => {
    const colors = statusColors()

    // A line with no class is a key that does nothing: refused, in conflict or invalid.
    expect(colors.get('.ShortcutDialog-StatusText')).toBe('var(--shortcut-status-danger)')
    expect(colors.get('.ShortcutDialog-StatusText.active')).toBe('var(--shortcut-status-muted)')
    expect(colors.get('.ShortcutDialog-StatusText.disabled')).toBe('var(--shortcut-status-muted)')
    expect(colors.get('.ShortcutDialog-StatusText.is-saving')).toBe('var(--shortcut-status-muted)')
    expect(colors.get('.ShortcutDialog-StatusText.is-success')).toBe(
      'var(--shortcut-status-success)'
    )
    expect(colors.get('.ShortcutDialog-StatusText.is-error')).toBe('var(--shortcut-status-danger)')
  })

  it('clears 4.5:1 on the cell in both themes, with the tokens the themes ship', () => {
    const white = rgb(themeToken(':root', '--tx-bg-color-overlay'))
    const primaryInk = rgb(themeToken(':root', '--tx-text-color-primary'))
    const lightInk = {
      danger: mix(rgb(themeToken(':root', '--tx-color-danger')), primaryInk, 0.55),
      success: mix(rgb(themeToken(':root', '--tx-color-success')), primaryInk, 0.45),
      muted: rgb(themeToken(':root', '--tx-text-color-regular'))
    }
    // The recipe's fallbacks are the light tokens, so a host without `variables.scss` measures the same.
    for (const [tone, recipe] of Object.entries(recipes)) {
      for (const [, token, fallback] of recipe.matchAll(/var\((--[\w-]+), (#[0-9a-f]{6})\)/gi)) {
        expect(fallback!.toLowerCase(), `${tone} ${token}`).toBe(
          themeToken(':root', token!).toLowerCase()
        )
      }
    }
    for (const [tone, ink] of Object.entries(lightInk)) {
      expect(contrast(ink, white), `light ${tone}`).toBeGreaterThanOrEqual(4.5)
    }

    const darkCell = rgb(themeToken('.dark', '--tx-bg-color-overlay'))
    for (const token of ['--tx-color-danger', '--tx-color-success', '--tx-text-color-secondary']) {
      expect(
        contrast(rgb(themeToken('.dark', token)), darkCell),
        `dark ${token}`
      ).toBeGreaterThanOrEqual(4.5)
    }
  })
})
