import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The `.dark` block of variables.scss must define its own semantic success / warning /
 * danger tokens. Before 2026-09 it inherited the `:root` light values (`#67c23a` etc.), which
 * are mid-saturation colours designed for a white page; mixed at 12% / 32% onto `#141414`
 * they produced olive / ochre / maroon fills and a hard dark border on every pill-family
 * component (TxStatusBadge, TxBadge, TxTag, TxAlert). The high-contrast dark mixin has
 * always defined its own three, so this only ever affected the normal dark theme.
 *
 * Every assertion below is derived from the file rather than snapshotted, so changing a
 * value keeps the test green as long as the invariants hold: the tokens are explicitly
 * defined in `.dark`, the hand-written `-rgb` triplets match the hex, and the ink clears
 * 7:1 on the dark page background.
 */

const VARIABLES_SCSS = resolve(__dirname, '../../../style/variables.scss')
const DARK_PAGE_BG = '#141414' // `--tx-bg-color` in `.dark`
const DARK_OVERLAY_BG = '#1d1e1f' // `--tx-bg-color-overlay` in `.dark`
const AA = 4.5
const AAA = 7

/**
 * Minimum contrast of each token used as ink on the dark page.
 *
 * Success and warning are pure ink tokens and clear AAA. Danger also serves as a solid
 * fill under white ink (`TxToolConfirmation .is-dangerous`, `TxTabBar__badge`), and the
 * two roles pull in opposite directions: AAA ink on `#141414` needs a relative luminance
 * of at least 0.349, while white ink on the same colour needs at most 0.312 to stay where
 * it was. No red satisfies both, so danger is held to AA as ink and the fill-side number
 * is recorded in the `.dark` block comment instead of asserted.
 */
const INK_CONTRAST_FLOOR = { success: AAA, warning: AAA, danger: AA } as const

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '')
}

/**
 * Returns the body of the first `{ … }` block whose opening brace follows `selector`,
 * walking braces so nested blocks do not truncate it. Throws when the selector is missing
 * so a typo cannot pass as "block is empty".
 */
function blockBody(source: string, selector: string): string {
  const start = source.indexOf(selector)
  if (start < 0)
    throw new Error(`selector not found: ${selector}`)
  const open = source.indexOf('{', start)
  let depth = 0
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{')
      depth++
    else if (source[i] === '}' && --depth === 0)
      return source.slice(open + 1, i)
  }
  throw new Error(`unterminated block for selector: ${selector}`)
}

function declaration(block: string, property: string): string | null {
  const match = new RegExp(`(^|\\n)\\s*${property.replace(/-/g, '\\-')}\\s*:\\s*([^;]+);`).exec(block)
  return match ? match[2].trim() : null
}

function hexToRgb(hex: string): [number, number, number] {
  const match = /^#([0-9a-f]{6})$/i.exec(hex.trim())
  if (!match)
    throw new Error(`expected a 6-digit hex colour, got: ${hex}`)
  const value = Number.parseInt(match[1], 16)
  return [(value >> 16) & 0xFF, (value >> 8) & 0xFF, value & 0xFF]
}

function relativeLuminance([r, g, b]: [number, number, number]): number {
  const channel = (c: number): number => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(hexToRgb(a))
  const lb = relativeLuminance(hexToRgb(b))
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la]
  return (hi + 0.05) / (lo + 0.05)
}

const source = stripComments(readFileSync(VARIABLES_SCSS, 'utf8'))
const rootBlock = blockBody(source, ':root')
const darkBlock = blockBody(source, '\n.dark')

const SEMANTIC_TOKENS = ['success', 'warning', 'danger'] as const

describe('dark semantic tokens (variables.scss)', () => {
  it('positive control: the brace matcher finds both theme blocks and the light tokens', () => {
    expect(rootBlock.length).toBeGreaterThan(100)
    expect(darkBlock.length).toBeGreaterThan(100)
    expect(declaration(rootBlock, '--tx-color-success')).toMatch(/^#[0-9a-f]{6}$/i)
    // The dark block is the one that sets the dark page background; proves we did not
    // grab the high-contrast mixin or the `:root` block twice.
    expect(declaration(darkBlock, '--tx-bg-color')).toBe(DARK_PAGE_BG)
    // Sanity-check the contrast maths against a known pair (white on black = 21:1).
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 5)
    // And that the overlay constant really is the overlay token, so the AA check above
    // is measured against the surface the pills actually sit on.
    expect(declaration(darkBlock, '--tx-bg-color-overlay')).toBe(DARK_OVERLAY_BG)
  })

  it.each(SEMANTIC_TOKENS)('.dark defines --tx-color-%s explicitly instead of inheriting the light value', (name) => {
    const dark = declaration(darkBlock, `--tx-color-${name}`)
    expect(dark, `--tx-color-${name} missing from .dark`).not.toBeNull()
    expect(dark).toMatch(/^#[0-9a-f]{6}$/i)
    expect(dark!.toLowerCase()).not.toBe(declaration(rootBlock, `--tx-color-${name}`)!.toLowerCase())
  })

  it.each(SEMANTIC_TOKENS)('.dark --tx-color-%s-rgb triplet matches the hex', (name) => {
    const hex = declaration(darkBlock, `--tx-color-${name}`)
    const triplet = declaration(darkBlock, `--tx-color-${name}-rgb`)
    expect(hex).not.toBeNull()
    expect(triplet).not.toBeNull()
    const expected = hexToRgb(hex!)
    const actual = triplet!.split(/\s+/).map(Number)
    expect(actual).toEqual(expected)
  })

  it.each(SEMANTIC_TOKENS)('.dark --tx-color-%s clears its ink floor on the dark page and AA on the overlay', (name) => {
    const hex = declaration(darkBlock, `--tx-color-${name}`)
    expect(hex).not.toBeNull()
    expect(contrastRatio(hex!, DARK_PAGE_BG)).toBeGreaterThanOrEqual(INK_CONTRAST_FLOOR[name])
    expect(contrastRatio(hex!, DARK_OVERLAY_BG)).toBeGreaterThanOrEqual(AA)
  })
})
