import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { compileStyle, parse } from 'vue/compiler-sfc'

/**
 * The row's scoped style, compiled the way the app compiles it. jsdom computes no layout, so the
 * rules that keep a row inside its list — and its switch on screen — can only be held in place by
 * what they compile to. Measured in the app: a compact 11-agent strip is 216px, and at the 1100px
 * window minimum the row is 760px; below that, these rules decide what gives way.
 */
function compiledStyle(): string {
  const source = readFileSync(fileURLToPath(new URL('./ResourceRow.vue', import.meta.url)), 'utf8')
  const [style] = parse(source).descriptor.styles
  return compileStyle({
    source: style!.content,
    filename: 'ResourceRow.vue',
    id: 'data-v-test',
    scoped: true,
    preprocessLang: 'scss'
  }).code
}

/** The declarations of one top-level rule: comments and `@media` blocks are set aside first. */
function rule(code: string, selector: string): string {
  const topLevel = code
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/@media[^{]*\{(?:[^{}]*\{[^}]*\})*[^{}]*\}/g, '')
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  // `[};]`: a rule follows another rule, or the `@charset` Sass emits for non-ASCII source.
  const match = topLevel.match(new RegExp(`(?:^|[};])\\s*${escaped}\\s*\\{([^}]*)\\}`))
  if (!match) throw new Error(`no rule for ${selector}`)
  return match[1]!
}

describe('ResourceRow style: a short row', () => {
  it('keeps a readable minimum for the text and lays every other part out after it', () => {
    const row = rule(compiledStyle(), '.ResourceRow[data-v-test]')

    // Not `minmax(0, 1fr)`: a zero minimum hands every pixel to the strip first and the name
    // disappears. Not `1fr` alone: its automatic minimum would grow the row past its list.
    expect(row).toMatch(/grid-template-columns:\s*minmax\(min\(10rem,\s*40%\),\s*1fr\)/)
    expect(row).toMatch(/grid-auto-columns:\s*auto/)
    expect(row).toMatch(/grid-auto-flow:\s*column/)
  })

  it('lets the agent strip shrink and clip instead of pushing the switch out', () => {
    const code = compiledStyle()
    const strip = rule(code, '.ResourceRow-Agents[data-v-test]')
    const placeholder = rule(code, '.ResourceRow-AgentsPlaceholder[data-v-test]')

    // A clipping box has no content-based minimum, so its column may be narrower than its marks.
    for (const declarations of [strip, placeholder]) {
      expect(declarations).toMatch(/min-width:\s*0/)
      expect(declarations).toMatch(/overflow:\s*hidden/)
    }
  })

  it('never lets the trailing controls shrink or clip', () => {
    const trailing = rule(compiledStyle(), '.ResourceRow-Trailing[data-v-test]')

    expect(trailing).not.toMatch(/overflow:/)
    expect(trailing).not.toMatch(/min-width:\s*0/)
  })
})
