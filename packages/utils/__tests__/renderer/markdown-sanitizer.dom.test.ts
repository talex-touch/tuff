// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import { sanitizeMarkdownHtml } from '../../renderer/shared/markdown-sanitizer'

/**
 * The parse-and-serialize path (#900).
 *
 * The pragma on line 1 is load-bearing: sanitizeMarkdownHtml only parses when a DOM exists,
 * and the repo's default vitest environment is node. Without it this file would silently
 * exercise the regex fallback and prove nothing about the path the renderer actually takes.
 *
 * The defect: the regex chain ran its passes in sequence over each other's output, so
 * deleting an attribute spliced the surrounding text into something new.
 */

/** Inputs whose sanitised form used to be executable. Verified against the pre-fix chain. */
const SPLICES = [
  {
    name: 'an on-handler reassembled around a deleted style attribute',
    input: '<img src="/nope.png" on style="y"error=alert(document.domain)>',
    was: '<img src="/nope.png" onerror=alert(document.domain)>',
  },
  {
    name: 'an iframe reassembled around a deleted handler',
    input: '<i onerror="x"frame src="//evil.example">',
    was: '<iframe src="//evil.example">',
  },
  {
    name: 'an object element reassembled around a deleted handler',
    input: '<obje onerror="x"ct data="//evil.example">',
    was: '<object data="//evil.example">',
  },
]

describe('sanitizeMarkdownHtml with a DOM', () => {
  it('confirms it is really parsing, so the assertions below mean something', () => {
    expect(typeof DOMParser).not.toBe('undefined')
  })

  it.each(SPLICES)('does not reassemble $name', ({ input }) => {
    const output = sanitizeMarkdownHtml(input)
    expect(output).not.toMatch(/\son[a-z]+\s*=/i)
    expect(output).not.toMatch(/<(iframe|object|embed|script)\b/i)
  })

  it('still strips the cases the old chain already handled', () => {
    expect(sanitizeMarkdownHtml('<script>alert(1)</script>')).not.toContain('alert')
    expect(sanitizeMarkdownHtml('<img src=x onerror=alert(1)>')).not.toContain('onerror')
    expect(sanitizeMarkdownHtml('<a href="javascript:alert(1)">x</a>')).not.toContain('javascript:')
    expect(sanitizeMarkdownHtml('<a/href="javascript:alert(1)">x</a>')).not.toContain('javascript:')
  })

  it('drops style and the other url-bearing attributes', () => {
    for (const attribute of ['style="x"', 'formaction="/x"', 'srcdoc="<b>"', 'ping="/x"'])
      expect(sanitizeMarkdownHtml(`<a ${attribute}>x</a>`)).not.toContain(attribute.split('=')[0])
  })

  it('keeps ordinary markdown output intact', () => {
    // Positive control: a sanitiser that emptied everything would satisfy every assertion
    // above while making every README blank.
    const output = sanitizeMarkdownHtml(
      '<p>Hello <strong>world</strong> <a href="https://example.test">link</a></p>',
    )
    expect(output).toContain('<strong>world</strong>')
    expect(output).toContain('href="https://example.test"')
  })

  it('keeps a relative image, which is how plugin READMEs reference assets', () => {
    expect(sanitizeMarkdownHtml('<img src="./logo.png">')).toContain('src="./logo.png"')
  })

  it('removes comments, which can carry payload text', () => {
    expect(sanitizeMarkdownHtml('<p>a<!-- <img src=x onerror=alert(1)> -->b</p>')).not.toContain('onerror')
  })
})
