// @vitest-environment node
import { createSSRApp, h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { describe, expect, it } from 'vitest'
import TxThinkingBody from '../../chain-of-thought/src/TxThinkingBody.vue'
import { MarkdownRenderer } from '../../markdown-editor/src/markdown-render'
import TxMarkdownView from '../../markdown-view/src/TxMarkdownView.vue'
import TxStreamMarkdown from '../src/TxStreamMarkdown.vue'

describe('SSR dompurify@3 fail-closed safety (node environment)', () => {
  it('renders TxThinkingBody, TxStreamMarkdown, TxMarkdownView, and MarkdownRenderer without crashing or poisoning cache', async () => {
    expect(typeof globalThis.window).toBe('undefined')

    const payload = 'Hello **world** <img src=x onerror=alert(1)>'

    const thinkingHtml = await renderToString(createSSRApp({
      render: () => h(TxThinkingBody, { text: payload }),
    }))
    expect(thinkingHtml).not.toContain('onerror')

    // Render TxStreamMarkdown twice across microtasks to confirm no cachedSanitizer poisoning.
    const streamHtml1 = await renderToString(createSSRApp({
      render: () => h(TxStreamMarkdown, { content: payload, sanitize: true }),
    }))
    await Promise.resolve()
    await Promise.resolve()
    const streamHtml2 = await renderToString(createSSRApp({
      render: () => h(TxStreamMarkdown, { content: payload, sanitize: true }),
    }))
    expect(streamHtml1).not.toContain('onerror')
    expect(streamHtml2).not.toContain('onerror')

    const mdViewHtml = await renderToString(createSSRApp({
      render: () => h(TxMarkdownView, { content: payload, sanitize: true }),
    }))
    expect(mdViewHtml).not.toContain('onerror')

    const renderer = new MarkdownRenderer({
      math: false,
      emoji: false,
      highlight: false,
      callouts: false,
      sanitize: true,
    })
    const { segments } = renderer.segment(payload)
    expect(segments.length).toBeGreaterThan(0)
    expect(renderer.blockHtml(segments[0]!)).toBe('')
  })
})
