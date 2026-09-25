import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import * as sass from 'sass'
import { describe, expect, it } from 'vitest'

// Compiled CSS, not source text — the guards can arrive through shared mixins.
const here = dirname(fileURLToPath(import.meta.url))
const SFC = resolve(here, '../src/TxCard.vue')

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

describe('txCard press feedback', () => {
  const css = compileStyles(SFC)

  it('positive control: the compile produced the card rule with its transition', () => {
    expect(css.length).toBeGreaterThan(1000)
    expect(css).toContain('.tx-card')
    expect(css).toMatch(/transition:/)
  })

  it('answers a press on clickable cards only', () => {
    // A press state on a plain surface promises an action it does not have.
    expect(css).toMatch(/\.is-clickable:active:not\(\.is-disabled\)/)
    expect(css).toMatch(/--tx-card-press-scale:\s*0\.985/)
  })

  it('does not react to a press while disabled', () => {
    const rule = css.match(/\.is-clickable:active[^{]*\{/)?.[0] ?? ''
    expect(rule).toContain(':not(.is-disabled)')
  })

  it('uses the standalone scale property, never a transform function', () => {
    // `transform` here is written every frame by a rAF spring (motionX/Y).
    // Easing it would fight those writes and make the inertial follow sticky;
    // the standalone `scale` composites separately.
    expect(css).toMatch(/\n\s*scale:\s*var\(--tx-card-press-scale/)

    const transformLine = css.match(/transform:\s*translate3d\([^;]*;/)?.[0] ?? ''
    expect(transformLine).not.toContain('scale(')
  })

  it('transitions scale without transitioning transform', () => {
    const transition = css.match(/transition:[^;]*;/)?.[0] ?? ''
    expect(transition).toContain('scale')
    // Putting `transform` in here is the regression this guards.
    expect(transition).not.toMatch(/\btransform\b/)
  })

  it('keeps the press subtle, because a card is a large surface', () => {
    // The ratio that reads as a nudge on a button reads as the page lurching
    // on a full-width card.
    const value = Number.parseFloat(css.match(/--tx-card-press-scale:\s*([\d.]+)/)?.[1] ?? '0')
    expect(value).toBeGreaterThanOrEqual(0.97)
    expect(value).toBeLessThan(1)
  })

  it('carries a reduced-motion escape', () => {
    // Non-negotiable for any declared transition; the card had none before.
    expect(css).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)/)
    const block = css.match(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*?\n\}/)?.[0] ?? ''
    expect(block).toMatch(/transition:\s*none/)
  })

  it('keeps the press state itself under reduced motion', () => {
    // Only the easing is dropped. The scale still applies, because it reports
    // "this went down" — what the user asked to be spared is the travel, not
    // the feedback.
    const block = css.match(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*?\n\}/)?.[0] ?? ''
    expect(block).not.toMatch(/--tx-card-press-scale/)
    expect(block).not.toMatch(/scale:\s*(?!none)/)
  })
})
