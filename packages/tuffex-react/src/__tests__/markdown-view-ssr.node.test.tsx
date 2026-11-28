// @vitest-environment node
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { TxMarkdownView } from '../components/TxMarkdownView'

describe('txMarkdownView SSR fail-closed sanitization', () => {
  it('fails closed during SSR when sanitize is enabled instead of leaking non-script XSS vectors', () => {
    expect(typeof globalThis.window).toBe('undefined')

    const xssPayload = [
      '<img src=x onerror=alert(1)>',
      '<svg onload=alert(2)></svg>',
      '<iframe srcdoc="<script>alert(3)</script>"></iframe>',
      '<a href="javascript:alert(4)">click</a>',
    ].join('\n')

    const markup = renderToStaticMarkup(createElement(TxMarkdownView, { content: xssPayload }))
    expect(markup).toContain('<div class="markdown-body"></div>')
    expect(markup).not.toContain('onerror')
    expect(markup).not.toContain('onload')
    expect(markup).not.toContain('srcdoc')
    expect(markup).not.toContain('javascript:')
  })
})
