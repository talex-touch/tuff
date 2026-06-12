import { describe, expect, it } from 'vitest'
import { escapeHtml, renderHighlightedTextHtml } from './highlight-html'

describe('renderHighlightedTextHtml', () => {
  it('escapes plain text even without match ranges', () => {
    expect(renderHighlightedTextHtml('<img src=x onerror=alert(1)>')).toBe(
      '&lt;img src=x onerror=alert(1)&gt;'
    )
  })

  it('escapes text around highlighted ranges', () => {
    expect(renderHighlightedTextHtml('<script>alert(1)</script>', [{ start: 1, end: 7 }])).toBe(
      '&lt;<span class="font-semibold text-red">script</span>&gt;alert(1)&lt;/script&gt;'
    )
  })

  it('merges overlapping ranges and escapes custom class names', () => {
    expect(
      renderHighlightedTextHtml(
        'abcdef',
        [
          { start: 1, end: 3 },
          { start: 2, end: 5 }
        ],
        {
          className: 'safe" onmouseover="bad'
        }
      )
    ).toBe('a<span class="safe&quot; onmouseover=&quot;bad">bcde</span>f')
  })

  it('supports one-based inclusive ranges', () => {
    expect(
      renderHighlightedTextHtml('abcdef', [{ start: 2, end: 4 }], {
        base: 1,
        inclusiveEnd: true
      })
    ).toBe('a<span class="font-semibold text-red">bcd</span>ef')
  })
})

describe('escapeHtml', () => {
  it('escapes quotes and apostrophes', () => {
    expect(escapeHtml(`"'&<>`)).toBe('&quot;&#39;&amp;&lt;&gt;')
  })
})
