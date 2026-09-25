import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import * as sass from 'sass'
import { describe, expect, it } from 'vitest'

// Compiled CSS, not source text: the guards arrive through shared `bui-*`
// mixins, so asserting on the `@include` would pass even if the mixin lost them.
const here = dirname(fileURLToPath(import.meta.url))
const SFC = resolve(here, '../src/TxSelectionActions.vue')

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

/** Leaf declaration bodies — `[^{}]` never matches a wrapper such as `@media`. */
function ruleBodies(css: string): string[] {
  return [...css.matchAll(/\{([^{}]*)\}/g)].map(match => match[1] ?? '')
}

describe('selectionActions motion contract', () => {
  const css = compileStyles(SFC)

  it('positive control: the compile produced real rules with an entrance on them', () => {
    expect(css.length).toBeGreaterThan(500)
    expect(css).toContain('@keyframes')
    expect(css).toMatch(/animation:/)
  })

  it('springs in rather than easing in, so the bar reads as arriving', () => {
    // The bar surfaces directly under the user's selection. `--tx-ease-out-strong`
    // decelerates hard but never crosses its end value, so it can only ever
    // "appear"; the back-out curve overshoots scale 1 and settles, which is the
    // bounce. Guarding the curve by name would pass on any cubic-bezier, so the
    // control points are asserted.
    expect(css).toContain('tx-bui-spring-in')
    expect(css).toMatch(/--tx-ease-spring,\s*cubic-bezier\(0\.34,\s*1\.56,\s*0\.64,\s*1\)/)
  })

  it('overshoots from below its resting size and position', () => {
    // Without room to travel there is nothing for the back curve to overshoot
    // with, and the bounce degrades to a plain fade.
    const frames = css.match(/@keyframes tx-bui-spring-in\s*\{[\s\S]*?\n\}/)?.[0] ?? ''
    expect(frames).toMatch(/scale\(0\.88\)/)
    expect(frames).toMatch(/translateY\(8px\)/)
    expect(frames).toMatch(/scale\(1\)\s+translateY\(0\)/)
  })

  it('does not reintroduce the plain pop-in it replaced', () => {
    // Nine other components share `bui-pop-in`; this one opting out is the
    // whole point, and a stray re-include would run two entrances at once.
    expect(css).not.toContain('tx-bui-pop-in')
  })

  it('stops every animation under reduced motion', () => {
    // The lookahead sits against the colon on purpose: `animation:\s*(?!none)`
    // would let `\s*` backtrack to zero width and match `animation: none` too.
    const played = css.match(/animation:(?!\s*none\b)/g) ?? []
    const stopped = css.match(/animation:\s*none\b/g) ?? []

    expect(played.length).toBeGreaterThan(0)
    expect(stopped.length).toBeGreaterThanOrEqual(played.length)
  })

  it('keeps the bar visible when the animation is dropped', () => {
    // `both` means the element rests on the animation's end state, so a
    // reduced-motion user must not be left with the 0% frame's opacity.
    const resting = ruleBodies(css).filter(body => /\.tx-bui-selection-actions\b/.test(body))
    for (const body of resting)
      expect(body).not.toMatch(/opacity:\s*0\s*;/)
  })

  it('reaches for the shared surface token rather than a literal', () => {
    // Hard-coding #fff survives neither the `.dark` swap nor a host's override.
    expect(css).toMatch(/background:\s*var\(--tx-bui-surface/)
  })
})
