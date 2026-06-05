import { describe, expect, it } from 'vitest'
import { renderMarkdownToSafeHtml, sanitizeMarkdownHtml } from '../../renderer/shared/markdown-sanitizer'

describe('markdown-sanitizer', () => {
  it('removes script tags and event handlers', () => {
    const html = sanitizeMarkdownHtml('<p onclick="alert(1)">ok</p><script>alert(2)</script>')

    expect(html).toBe('<p>ok</p>')
  })

  it('removes dangerous markdown link protocols', () => {
    const html = renderMarkdownToSafeHtml('[bad](javascript:alert(1)) [ok](https://example.com)')

    expect(html).not.toContain('javascript:')
    expect(html).toContain('href="https://example.com"')
  })

  it('removes dangerous html link and media protocols', () => {
    const html = sanitizeMarkdownHtml(
      '<a href="java\nscript:alert(1)">bad</a><img src="data:text/html;base64,PHNjcmlwdA=="><a href="mailto:team@example.com">mail</a>'
    )

    expect(html).not.toContain('java')
    expect(html).not.toContain('data:text/html')
    expect(html).toContain('href="mailto:team@example.com"')
  })

  it('keeps relative links for local documentation', () => {
    const html = renderMarkdownToSafeHtml('[docs](/docs/start) [anchor](#top)')

    expect(html).toContain('href="/docs/start"')
    expect(html).toContain('href="#top"')
  })
})
