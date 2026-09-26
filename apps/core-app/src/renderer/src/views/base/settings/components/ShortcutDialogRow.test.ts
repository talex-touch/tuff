import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const here = dirname(fileURLToPath(import.meta.url))

/** The row's own stylesheet, comments stripped. */
function rowStylesheet(): string {
  const source = readFileSync(resolve(here, 'ShortcutDialogRow.vue'), 'utf8')
  return [...source.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)]
    .map((match) => match[1] ?? '')
    .join('\n')
    .replace(/\/\*[\s\S]*?\*\//g, '')
}

/**
 * The declarations of each rule in the row's own stylesheet, by selector, with multi-line values
 * collapsed onto one line. jsdom applies no SFC styles, so what a class resolves to is read from
 * the source it is declared in.
 */
function statusRules(): Map<string, Map<string, string>> {
  const css = rowStylesheet()
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

/** The `:root` (light) or `.dark` block of the tuffex tokens. */
function themeBlock(block: ':root' | '.dark'): string {
  const scss = readFileSync(
    resolve(
      here,
      '../../../../../../../../../packages/tuffex/packages/components/style/variables.scss'
    ),
    'utf8'
  )
  const start = scss.indexOf(`\n${block} {`)
  return scss.slice(start, scss.indexOf('\n}', start))
}

/** Hex from the `:root` (light) or `.dark` block of the tuffex tokens. */
function themeToken(block: ':root' | '.dark', token: string): string {
  const value = new RegExp(`${token}:\\s*(#[0-9a-f]{6});`, 'i').exec(themeBlock(block))?.[1]
  if (!value) throw new Error(`${token} not found in ${block}`)
  return value
}

/** A space-separated `--tx-color-*-rgb` triplet from the same blocks. */
function themeTriplet(block: ':root' | '.dark', token: string): Rgb {
  const value = new RegExp(`${token}:\\s*(\\d+) (\\d+) (\\d+);`).exec(themeBlock(block))
  if (!value) throw new Error(`${token} not found in ${block}`)
  return [Number(value[1]), Number(value[2]), Number(value[3])]
}

type Rgb = [number, number, number]
/** `rgb(color / alpha)` painted over `base`, in the gamma-encoded channels browsers blend in. */
const over = (color: Rgb, alpha: number, base: Rgb): Rgb =>
  color.map((channel, i) => channel * alpha + base[i]! * (1 - alpha)) as Rgb
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

/**
 * A save result tints its row: 8% green after a save, 16% red after a failure. The
 * `--tx-color-*-rgb` tokens are space-separated triplets (`103 194 58`), so only
 * `rgb(var(--…-rgb) / alpha)` survives substitution. The comma form `rgba(var(--…-rgb), alpha)`
 * computes to transparent in Chromium, which is why the tint never showed. The status text sits in
 * the sticky cell, which keeps its opaque base under the same single tint and has to clear 4.5:1
 * on it.
 */
describe('ShortcutDialogRow save-result tint', () => {
  /** A row state's `--shortcut-row-tint`, parsed; throws on any form but `rgb(var(…) / a)`. */
  function rowTint(state: 'is-success' | 'is-error'): { token: string; alpha: number } {
    const value = statusRules().get(`.ShortcutDialog-Row.${state}`)?.get('--shortcut-row-tint')
    const match = /^rgb\(var\((--[\w-]+-rgb)\) \/ (\d*\.?\d+)\)$/.exec(value ?? '')
    if (!match) throw new Error(`${state} tint is not rgb(var(--…-rgb) / alpha): ${value}`)
    return { token: match[1]!, alpha: Number(match[2]) }
  }

  it('writes each tint in the one form an rgb triplet parses in', () => {
    // `rgba(var(--x-rgb), a)` substitutes to `rgba(103 194 58, a)`, which no browser accepts.
    expect(rowStylesheet()).not.toMatch(/rgba?\(\s*var\(--[\w-]+-rgb\)\s*,/)
    expect(rowTint('is-success')).toEqual({ token: '--tx-color-success-rgb', alpha: 0.08 })
    expect(rowTint('is-error')).toEqual({ token: '--tx-color-danger-rgb', alpha: 0.16 })
  })

  it('tints the row, and lays the same single tint over the sticky cell’s opaque base', () => {
    const rules = statusRules()

    for (const state of ['is-success', 'is-error']) {
      expect(rules.get(`.ShortcutDialog-Row.${state}`)?.get('background-color'), state).toBe(
        'var(--shortcut-row-tint)'
      )
      // Inheriting the row's translucent tint would stack it twice under the status text.
      expect(
        rules.get(`.ShortcutDialog-Row.${state} .ShortcutDialog-EnabledCell`)?.get('background'),
        state
      ).toBe(
        'linear-gradient(var(--shortcut-row-tint), var(--shortcut-row-tint)), var(--tx-bg-color-overlay)'
      )
    }
  })

  it.each([':root', '.dark'] as const)(
    'keeps the status text at 4.5:1 on the tinted cell in %s',
    (block) => {
      const cell = rgb(themeToken(block, '--tx-bg-color-overlay'))
      const hue = (token: string) => rgb(themeToken(block, token))
      // Light themes mix the hue toward the primary ink (the recipes above); dark keeps it plain.
      const ink =
        block === ':root'
          ? {
              success: mix(hue('--tx-color-success'), hue('--tx-text-color-primary'), 0.45),
              danger: mix(hue('--tx-color-danger'), hue('--tx-text-color-primary'), 0.55)
            }
          : { success: hue('--tx-color-success'), danger: hue('--tx-color-danger') }

      for (const [state, text] of [
        ['is-success', ink.success],
        ['is-error', ink.danger]
      ] as const) {
        const { token, alpha } = rowTint(state)
        const tinted = over(themeTriplet(block, token), alpha, cell)
        expect(contrast(text, tinted), `${block} ${state}`).toBeGreaterThanOrEqual(4.5)
      }
    }
  )
})
