// @vitest-environment jsdom
import DOMPurify from 'dompurify'
import { Marked } from 'marked'
import { describe, expect, it } from 'vitest'
import { mathExtension } from '../src/math-extension'

/**
 * The one integration the unit tests cannot reach.
 *
 * `TxStreamMarkdown` runs every block through DOMPurify before `v-html`, and
 * the rest of the suite mocks DOMPurify away. KaTeX positions almost every
 * glyph with an inline `style`, so if the real sanitizer strips those the
 * formula still "renders" — as a scrambled pile of characters that no test
 * asserting on `.katex` would catch.
 */
const marked = new Marked({ gfm: true, breaks: true }).use(mathExtension())

function sanitized(content: string): string {
  return DOMPurify.sanitize(marked.parse(content) as string)
}

describe('KaTeX output survives the real sanitizer', () => {
  it('keeps the inline styles KaTeX positions glyphs with', () => {
    const raw = marked.parse('$\\frac{a}{b}$') as string
    // Guard the premise: if KaTeX stopped emitting inline styles, this test
    // would pass for the wrong reason.
    expect(raw).toMatch(/style="[^"]*"/)

    const clean = sanitized('$\\frac{a}{b}$')
    expect(clean).toMatch(/style="[^"]*"/)
    expect(clean).toContain('katex')
  })

  it('keeps display math structure', () => {
    const clean = sanitized('$$\n\\sum_{i=1}^n i\n$$')
    expect(clean).toContain('katex-display')
    expect(clean).toContain('tx-stream-md__math-block')
  })

  it('keeps the class names the stylesheet targets', () => {
    const clean = sanitized('$x^2$')
    expect(clean).toContain('class="katex"')
  })
})
