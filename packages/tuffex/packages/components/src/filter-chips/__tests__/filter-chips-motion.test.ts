import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import * as sass from 'sass'
import { describe, expect, it } from 'vitest'

/**
 * BUI hard rule 2: a `tx-bui-*` component that animates cuts its tweens under
 * `prefers-reduced-motion: reduce`, and the guard is verified against the
 * compiled style block rather than the source — a component can keep its
 * `@media` block and still lose the guard if a shared mixin changes, and
 * matching on source text would not notice.
 *
 * Both directions are asserted. A test that only looks for `transition: none`
 * would still pass if the transition it is meant to cut had been deleted
 * outright, which is a different component, not a guarded one.
 */
const here = dirname(fileURLToPath(import.meta.url))
const COMPONENT = resolve(here, '../src/TxFilterChips.vue')

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

/** The rule set for `selector`, from `{` to its closing `}`. */
function ruleFor(css: string, selector: string): string {
  const at = css.indexOf(selector)
  expect(at, `${selector} is not in the compiled stylesheet`).toBeGreaterThanOrEqual(0)
  const open = css.indexOf('{', at)
  const close = css.indexOf('}', open)
  return css.slice(open, close)
}

describe('txFilterChips reduced motion', () => {
  const css = compileStyles(COMPONENT)

  it('travels by default, so there is a tween for the guard to cut', () => {
    const indicator = ruleFor(css, '.tx-bui-filter-chips__indicator')
    expect(indicator).toContain('transition:')
    expect(indicator).toContain('transform')
  })

  it('cuts the travel under prefers-reduced-motion', () => {
    const query = css.indexOf('@media (prefers-reduced-motion: reduce)')
    expect(query).toBeGreaterThanOrEqual(0)
    const reduced = css.slice(query)
    expect(reduced).toContain('.tx-bui-filter-chips__indicator')
    expect(ruleFor(reduced, '.tx-bui-filter-chips__indicator')).toContain('transition: none')
  })

  it('rests visible, so nothing depends on the animation to be seen', () => {
    // Rule 2's other half: a resting style may not be an `opacity: 0` that only
    // a tween reveals. The fill is painted at rest and only moves on a change.
    const indicator = ruleFor(css, '.tx-bui-filter-chips__indicator')
    expect(indicator).toContain('background:')
    expect(indicator).not.toMatch(/opacity:\s*0\b/)
  })
})
