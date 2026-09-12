// @vitest-environment node
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as sass from 'sass'
import { describe, expect, it } from 'vitest'

const here = dirname(fileURLToPath(import.meta.url))
const stylePath = resolve(here, '../../style')

/**
 * `bui-scope` stands in for Tailwind's preflight inside each BUI component. It
 * used to nest its element rules directly, which compiled to `.tx-bui-x button`
 * — specificity (0,1,1). That outranks every `&__name` rule a component writes
 * for its own buttons, so declarations sat in the source and silently never
 * applied: `TxSidebarNav`'s rows lost `padding: 6px 8px` and rendered 19.5px
 * tall instead of 31.5px, and `TxSearchPanel`'s options lost their padding,
 * font-size and colour.
 *
 * A reset has to be beatable by one class. These tests compile the real mixin
 * and pin that.
 */
function compile(source: string): string {
  return sass.compileString(source, { loadPaths: [stylePath], style: 'expanded' }).css
}

const FIXTURE = `
@use 'mixins' as *;

.tx-bui-probe {
  @include bui-scope;

  &__row {
    padding: 6px 8px;
    color: rebeccapurple;
  }
}
`

/** Count (id, class, type) the way the cascade does, for simple selectors. */
function specificity(selector: string): [number, number, number] {
  // :where() contributes nothing, so strip it (and what it holds) first.
  const outside = selector.replace(/:where\([^)]*\)/g, '')
  const ids = (outside.match(/#[\w-]+/g) || []).length
  const classes = (outside.match(/\.[\w-]+|\[[^\]]+\]|:(?!:)[\w-]+/g) || []).length
  const types = (outside.match(/(^|[\s>+~])[a-z][\w-]*/g) || []).length
  return [ids, classes, types]
}

describe('bui-scope reset specificity', () => {
  const css = compile(FIXTURE)

  function ruleFor(fragment: string): string {
    const match = css.split('\n').find(line => line.includes(fragment) && line.trim().endsWith('{'))
    return (match ?? '').replace(/\s*\{$/, '').trim()
  }

  it('compiles the fixture', () => {
    expect(css).toContain('.tx-bui-probe__row')
    expect(css).toContain('button')
  })

  it('scopes the element reset through :where() so one class outranks it', () => {
    const reset = ruleFor(') button')
    expect(reset).toBe(':where(.tx-bui-probe) button')
    expect(specificity(reset)).toEqual([0, 0, 1])
  })

  it('lets a component style its own button element', () => {
    const own = ruleFor('.tx-bui-probe__row')
    expect(specificity(own)).toEqual([0, 1, 0])

    const [, ownClasses] = specificity(own)
    const [, resetClasses, resetTypes] = specificity(ruleFor(') button')!)
    // One class beats zero classes whatever the type count, and whatever order
    // the two rules happen to be emitted in.
    expect(ownClasses).toBeGreaterThan(resetClasses)
    expect(resetTypes).toBeGreaterThan(0)
  })

  it('still resets a bare element that carries no class', () => {
    expect(css).toMatch(/:where\(\.tx-bui-probe\) button \{[^}]*padding: 0/)
    expect(css).toMatch(/:where\(\.tx-bui-probe\) ul,\n:where\(\.tx-bui-probe\) ol \{[^}]*list-style: none/)
  })

  it('keeps the root-level declarations on the component root itself', () => {
    // font-size/colour are inherited defaults, not descendant rules — moving
    // them into :where() would stop them applying to the root at all.
    expect(css).toMatch(/\.tx-bui-probe \{[^}]*font-size: 13px/)
  })
})
