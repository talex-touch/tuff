import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * `--tx-status-chip-*` is the disc ramp behind TxStatusBadge's knocked-out glyph.
 *
 * It exists because the label ramp cannot carry one: a white glyph on
 * `--tx-color-*` measures 1.67–2.90:1 across our themes, under the 3:1 WCAG
 * minimum for a graphical object. (The 1.74:1 recorded in
 * tuffex-design-rules.md is dark-theme `--tx-color-success #4ade80`.) BUI gets
 * away with it upstream because its semantic hues are markedly darker —
 * `--tx-bui-red #e3474c` is 3.97:1 against white where `--tx-color-danger
 * #f56c6c` is 2.88:1.
 *
 * Two invariants are load-bearing and easy to break silently:
 *
 * 1. **Every theme must define the whole set.** A missing token makes
 *    `var(--tx-status-chip-success)` unresolvable, and the disc renders
 *    transparent — the glyph then sits on the badge tint at roughly 1.1:1,
 *    which looks like a rendering glitch rather than a contrast bug.
 * 2. **Every disc/glyph pairing must clear 3:1.** High-contrast dark inverts
 *    the pairing (light disc, dark glyph) because its palette is light-on-dark
 *    by design; darkening the disc there would make it vanish into the page.
 *
 * Values are read from the file, so retuning a hue keeps this green as long as
 * it still clears the floor.
 */

const VARIABLES_SCSS = resolve(__dirname, '../../../style/variables.scss')
const TONES = ['success', 'warning', 'danger', 'info', 'muted'] as const
const NON_TEXT_MIN = 3

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '')
}

/** Body of the first brace-balanced block whose opening brace follows `selector`. */
function blockBody(source: string, selector: string): string {
  const at = source.indexOf(selector)
  if (at === -1)
    throw new Error(`selector not found: ${selector}`)
  const open = source.indexOf('{', at + selector.length)
  if (open === -1)
    throw new Error(`no block after: ${selector}`)
  let depth = 0
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{')
      depth += 1
    else if (source[i] === '}') {
      depth -= 1
      if (depth === 0)
        return source.slice(open + 1, i)
    }
  }
  throw new Error(`unbalanced block after: ${selector}`)
}

function token(body: string, name: string): string | null {
  const match = body.match(new RegExp(`--${name}\\s*:\\s*(#[0-9a-fA-F]{3,8})\\s*;`))
  return match ? match[1]!.toLowerCase() : null
}

const srgb = (channel: number): number => {
  const v = channel / 255
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map(i => Number.parseInt(hex.slice(i, i + 2), 16))
  return 0.2126 * srgb(r!) + 0.7152 * srgb(g!) + 0.0722 * srgb(b!)
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi! + 0.05) / (lo! + 0.05)
}

const source = stripComments(readFileSync(VARIABLES_SCSS, 'utf8'))

const THEMES: Record<string, string> = {
  'light (:root)': blockBody(source, '\n:root'),
  'dark': blockBody(source, "\n[data-theme='dark'],\n.dark"),
  'high-contrast light': blockBody(source, '@mixin tx-high-contrast-light'),
  'high-contrast dark': blockBody(source, '@mixin tx-high-contrast-dark'),
}

describe('status chip ramp (variables.scss)', () => {
  it('positive control: the block matcher isolates four distinct theme bodies', () => {
    const bodies = Object.values(THEMES)
    expect(bodies).toHaveLength(4)
    for (const body of bodies)
      expect(body.length).toBeGreaterThan(200)
    // Distinct, or every assertion below would be reading one block four times.
    expect(new Set(bodies).size).toBe(4)
    // And it really finds the tokens rather than matching empty strings.
    expect(token(THEMES['light (:root)']!, 'tx-status-chip-success')).toBe('#16a34a')
  })

  for (const [theme, body] of Object.entries(THEMES)) {
    describe(theme, () => {
      it('defines the glyph colour', () => {
        expect(token(body, 'tx-status-chip-on')).not.toBeNull()
      })

      for (const tone of TONES) {
        it(`defines and contrasts the ${tone} disc`, () => {
          const disc = token(body, `tx-status-chip-${tone}`)
          const glyph = token(body, 'tx-status-chip-on')

          // Missing here means `var()` fails to resolve and the disc goes
          // transparent, which reads as a glitch rather than a contrast bug.
          expect(disc, `--tx-status-chip-${tone} missing in ${theme}`).not.toBeNull()

          expect(contrast(disc!, glyph!)).toBeGreaterThanOrEqual(NON_TEXT_MIN)
        })
      }
    })
  }

  it('does not simply reuse the label ramp, which is what fails the floor', () => {
    const root = THEMES['light (:root)']!
    // If these ever converge, the whole reason the ramp exists is gone.
    expect(token(root, 'tx-status-chip-success')).not.toBe(token(root, 'tx-color-success'))
    expect(token(root, 'tx-status-chip-danger')).not.toBe(token(root, 'tx-color-danger'))

    // Negative control: the label ramp really would fail, so the floor above is
    // discriminating rather than trivially satisfied.
    expect(contrast(token(root, 'tx-color-danger')!, '#ffffff')).toBeLessThan(NON_TEXT_MIN)
  })

  it('inverts the pairing in high-contrast dark instead of darkening the disc', () => {
    const hcDark = THEMES['high-contrast dark']!
    const glyph = token(hcDark, 'tx-status-chip-on')!
    const disc = token(hcDark, 'tx-status-chip-success')!

    // That theme is light-on-dark by design; a dark disc would disappear.
    expect(luminance(glyph)).toBeLessThan(luminance(disc))
  })
})
