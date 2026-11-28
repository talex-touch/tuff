import { describe, expect, it } from 'vitest'
import { sanitizeUserCss } from './sanitizeUserCss'

describe('sanitizeUserCss', () => {
  it('allows clean custom CSS', () => {
    const css = '.app-root { --accent: #3b82f6; border-radius: 12px; }'
    expect(sanitizeUserCss(css)).toBe(css)
  })

  it('rejects @import, url(), image-set(), cross-fade(), expression(), and HTML tags', () => {
    expect(sanitizeUserCss('@import "https://evil.invalid/a.css";')).toBe('')
    expect(sanitizeUserCss('body { background: url(https://evil.invalid/a.png); }')).toBe('')
    expect(sanitizeUserCss('body { background: image-set(url(a.png) 1x); }')).toBe('')
    expect(sanitizeUserCss('body { background: cross-fade(url(a.png), url(b.png), 50%); }')).toBe(
      ''
    )
    expect(sanitizeUserCss('body { width: expression(alert(1)); }')).toBe('')
    expect(sanitizeUserCss('body { -moz-binding: url("x.xml#xss"); }')).toBe('')
    expect(sanitizeUserCss('body { behavior: url(xss.htc); }')).toBe('')
    expect(sanitizeUserCss('</style><script>alert(1)</script>')).toBe('')
  })

  it('rejects CSS comment-split and hex-escape bypasses as well as unclosed comments', () => {
    expect(sanitizeUserCss('body { background: u/*x*/rl(https://evil.invalid/p); }')).toBe('')
    expect(sanitizeUserCss('@im/*x*/port "https://evil.invalid/a.css";')).toBe('')
    expect(sanitizeUserCss('body { background: \\75 rl(https://evil.invalid/p); }')).toBe('')
    expect(sanitizeUserCss('\\40 import "https://evil.invalid/a.css";')).toBe('')
    expect(sanitizeUserCss('body { color: red; } /* unclosed comment')).toBe('')
  })
})
