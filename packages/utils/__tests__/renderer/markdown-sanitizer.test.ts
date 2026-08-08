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

/**
 * The `/` attribute-name separator (#907).
 *
 * The handler and style strippers already used `[\s/]+`, because `<img/onerror=...>` is
 * valid HTML.
 * The href/src protocol allowlist still used `\s+`, so `<a/href="javascript:...">` was never
 * inspected and came out of the sanitiser unchanged — while the ordinary `<a href=...>` form
 * was correctly reduced to `<a>`. Release-note bodies and plugin READMEs reach v-html in the
 * privileged renderer, so that anchor was one user click from ipcRenderer.
 */
describe('attribute separators before href/src', () => {
  const dangerous = 'javascript:alert(1)'

  it('strips a javascript: href introduced with a slash separator', () => {
    expect(sanitizeMarkdownHtml(`<a/href="${dangerous}">x</a>`)).not.toContain('javascript:')
  })

  it('strips it with repeated slashes', () => {
    expect(sanitizeMarkdownHtml(`<a//href="${dangerous}">x</a>`)).not.toContain('javascript:')
  })

  it('strips it with a slash after whitespace and vice versa', () => {
    expect(sanitizeMarkdownHtml(`<a /href="${dangerous}">x</a>`)).not.toContain('javascript:')
    expect(sanitizeMarkdownHtml(`<a/ href="${dangerous}">x</a>`)).not.toContain('javascript:')
  })

  it('strips the unquoted form too', () => {
    // The second of the two regexes had the same defect and is easy to forget.
    expect(sanitizeMarkdownHtml(`<a/href=${dangerous}>x</a>`)).not.toContain('javascript:')
  })

  it('strips a slash-separated src, not just href', () => {
    expect(sanitizeMarkdownHtml(`<img/src="${dangerous}">`)).not.toContain('javascript:')
  })

  it('strips data: and vbscript: behind the same separator', () => {
    expect(sanitizeMarkdownHtml('<a/href="data:text/html,<script>1</script>">x</a>')).not.toContain('data:')
    expect(sanitizeMarkdownHtml('<a/href="vbscript:msgbox">x</a>')).not.toContain('vbscript:')
  })

  it('keeps a legitimate link written with a slash separator', () => {
    // Positive control: the fix must inspect these attributes, not delete them wholesale.
    const output = sanitizeMarkdownHtml('<a/href="https://example.test/docs">x</a>')
    expect(output).toContain('href="https://example.test/docs"')
    expect(output).not.toContain('/href')
  })

  it('still keeps an ordinary link untouched', () => {
    expect(sanitizeMarkdownHtml('<a href="https://example.test">x</a>')).toContain(
      'href="https://example.test"'
    )
  })
})
