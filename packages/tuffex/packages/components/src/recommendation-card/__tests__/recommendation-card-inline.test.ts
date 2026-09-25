import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import * as sass from 'sass'
import { describe, expect, it } from 'vitest'

// Compiled CSS, not source text — these rules sit inside `bui-scope` and reach
// slot content, so what matters is the selector that survives nesting.
const here = dirname(fileURLToPath(import.meta.url))
const SFC = resolve(here, '../src/TxRecommendationCard.vue')
const TOKENS = resolve(here, '../../../style/bui-tokens.scss')

const STYLE_BLOCK_RE = /<style[^>]*>([\s\S]*?)<\/style>/g

function compileStyles(vuePath: string): string {
  const source = readFileSync(vuePath, 'utf8')
  const blocks = [...source.matchAll(STYLE_BLOCK_RE)].map(match => match[1] ?? '')
  expect(blocks.length).toBeGreaterThan(0)

  return blocks
    .map(block => sass.compileString(block, {
      url: pathToFileURL(vuePath),
      syntax: 'scss',
    }).css)
    .join('\n')
}

/** The rule body for one selector, so an assertion cannot drift into the next. */
function ruleFor(css: string, selector: string): string {
  const index = css.indexOf(selector)
  expect(index, `selector not found: ${selector}`).toBeGreaterThanOrEqual(0)

  const open = css.indexOf('{', index)
  const close = css.indexOf('}', open)

  return css.slice(open + 1, close)
}

describe('txRecommendationCard inline rationale', () => {
  const css = compileStyles(SFC)

  it('positive control: the compile produced the body rules', () => {
    expect(css.length).toBeGreaterThan(1000)
    expect(css).toContain('.tx-bui-recommendation-card__body code')
    expect(css).toContain('.tx-bui-recommendation-card__body mark')
  })

  it('negative control: the rule slicer does not walk past its own block', () => {
    const body = ruleFor(css, '.tx-bui-recommendation-card__body mark {')
    // `mark` is followed in source by its `::before`; if the slice leaked, the
    // dot's own background would show up here.
    expect(body).not.toContain('border-radius: 50%')
  })

  it('reaches slot content, so a host filling #body gets the treatment', () => {
    // The whole point of styling descendants rather than exposing classes: the
    // rationale is authored by the host, in the host's own markup.
    expect(css).toMatch(/\.tx-bui-recommendation-card__body (code|mark)\b/)
  })

  it('keeps code monospaced — it stands for a real identifier', () => {
    const rule = ruleFor(css, '.tx-bui-recommendation-card__body code {')

    expect(rule).toMatch(/font-family:\s*var\(--tx-bui-font-mono/)
    expect(rule).toMatch(/border-radius:\s*6px/)
  })

  it('gives code semantic variants that stay on the BUI token layer', () => {
    // Hard-coding #189a4d here would read correctly in light and glare in dark;
    // both tints are defined in each bui-tokens block.
    const success = ruleFor(css, '.tx-bui-recommendation-card__body code.is-success {')
    expect(success).toMatch(/color:\s*var\(--tx-bui-green,/)
    expect(success).toMatch(/background:\s*var\(--tx-bui-green-tint,/)

    const warning = ruleFor(css, '.tx-bui-recommendation-card__body code.is-warning {')
    expect(warning).toMatch(/color:\s*var\(--tx-bui-orange,/)
    expect(warning).toMatch(/background:\s*var\(--tx-bui-orange-tint,/)

    const tokens = readFileSync(TOKENS, 'utf8')
    for (const token of ['--tx-bui-green-tint', '--tx-bui-orange-tint'])
      expect(tokens.match(new RegExp(`${token}:`, 'g'))?.length ?? 0).toBeGreaterThanOrEqual(2)
  })

  it('shapes mark as a pill, so an entity does not read as an identifier', () => {
    const rule = ruleFor(css, '.tx-bui-recommendation-card__body mark {')

    expect(rule).toMatch(/border-radius:\s*999px/)
    // Not monospaced: this is a human-readable name, not something to be typed.
    expect(rule).not.toMatch(/font-mono/)
  })

  it('overrides the engine default highlight on mark', () => {
    // Every engine ships `mark { background-color: Mark }` — a yellow block.
    // `background` alone loses to it in some UA sheets, so both are set.
    const rule = ruleFor(css, '.tx-bui-recommendation-card__body mark {')

    expect(rule).toMatch(/background:\s*var\(--tx-bui-hover-2,/)
    expect(rule).toMatch(/background-color:\s*var\(--tx-bui-hover-2,/)
  })

  it('lets the host colour the entity dot, and falls back when it does not', () => {
    // Only the host knows what colour a given supplier is; the component must
    // still render something legible when nobody says.
    const dot = ruleFor(css, '.tx-bui-recommendation-card__body mark::before {')

    expect(dot).toMatch(/background:\s*var\(--tx-entity-color,\s*var\(--tx-bui-ink-3/)
    expect(dot).toMatch(/border-radius:\s*50%/)
    expect(dot).toMatch(/flex:\s*none/)
  })

  it('aligns the dot with the text baseline box rather than stacking', () => {
    const rule = ruleFor(css, '.tx-bui-recommendation-card__body mark {')

    expect(rule).toMatch(/display:\s*inline-flex/)
    expect(rule).toMatch(/align-items:\s*center/)
  })
})
