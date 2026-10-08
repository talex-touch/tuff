import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { compileStyle, parse } from 'vue/compiler-sfc'

/**
 * The header's scoped style, compiled the way the app compiles it. jsdom computes no layout, so
 * the narrow-row rule can only be held in place by what it compiles to.
 */
function compiledStyle(): string {
  const source = readFileSync(
    fileURLToPath(new URL('./InsightsHeader.vue', import.meta.url)),
    'utf8'
  )
  const [style] = parse(source).descriptor.styles
  return compileStyle({
    source: style.content,
    filename: 'InsightsHeader.vue',
    id: 'data-v-test',
    scoped: true,
    preprocessLang: 'scss'
  }).code
}

describe('InsightsHeader style', () => {
  /**
   * Below 680px every child of the row takes an equal share: the status, the page's buttons and
   * the menu's popover trigger. Vue scopes a trailing `*` on its parent, so `> *` compiles to
   * `.InsightsHeader-Actions[data-v-…] > *` and reaches all of them, slot content included —
   * the behaviour the rule had while the voice page owned it. A `:slotted(*)` "fix" reaches only
   * some of them and re-proportions the row (measured at 640px: status/records 102/100 → 124/80).
   */
  it('shares the narrow row between every child, slot content included', () => {
    const code = compiledStyle()

    expect(code).toMatch(/\.InsightsHeader-Actions\[data-v-test\] > \*\s*\{\s*flex: 1 1 0;?\s*\}/)
    expect(code).not.toContain('data-v-test-s')
  })
})
