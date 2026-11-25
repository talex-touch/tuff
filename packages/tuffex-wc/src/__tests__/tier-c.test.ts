import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import { registerTuffexElements } from '../index'

beforeAll(() => {
  registerTuffexElements()
})

afterEach(() => {
  document.body.innerHTML = ''
})

describe('Tier C custom elements (tx-stream-text, tx-markdown-view)', () => {
  it('renders tx-stream-text with plain text, inline JSON runs, reveal preset, and exposed skip/replay methods', async () => {
    const container = document.createElement('div')
    container.innerHTML = `
      <tx-stream-text
        content="Hello streaming world"
        reveal="aurora"
        paced="false"
      ></tx-stream-text>
    `
    document.body.appendChild(container)
    await nextTick()

    const el = container.querySelector('tx-stream-text') as (HTMLElement & { skip?: () => void, replay?: () => void }) | null
    expect(el).not.toBeNull()
    expect(el?.querySelector('.tx-stream-text.is-reveal-aurora')).not.toBeNull()
    expect(el?.textContent).toContain('Hello streaming world')
    expect(typeof el?.skip).toBe('function')
    expect(typeof el?.replay).toBe('function')

    // JSON inline runs attribute coercion
    const rich = document.createElement('tx-stream-text')
    rich.setAttribute('content', JSON.stringify([
      { type: 'text', text: 'Bold', marks: ['strong'] },
      { type: 'text', text: ' code', marks: ['code'] },
    ]))
    rich.setAttribute('paced', 'false')
    document.body.appendChild(rich)
    await nextTick()

    expect(rich.querySelector('strong')?.textContent).toBe('Bold')
    expect(rich.querySelector('code')?.textContent?.trim()).toBe('code')
  })

  it('renders tx-markdown-view with sanitized HTML, dark theme attribute, and default slot fallback', async () => {
    const container = document.createElement('div')
    container.innerHTML = `
      <tx-markdown-view
        theme="dark"
        content="# Heading&#10;&#10;Hello **TuffEx** <script>alert(1)</script>"
      ></tx-markdown-view>
    `
    document.body.appendChild(container)
    // Wait for async dompurify import in TxMarkdownView
    await new Promise(resolve => setTimeout(resolve, 60))
    await nextTick()

    const md = container.querySelector('tx-markdown-view')!
    const root = md.querySelector('.tx-markdown-view')
    expect(root).not.toBeNull()
    expect(root?.getAttribute('data-theme')).toBe('dark')
    expect(md.querySelector('h1')?.textContent).toBe('Heading')
    expect(md.querySelector('strong')?.textContent).toBe('TuffEx')
    expect(md.querySelector('script')).toBeNull()

    // Light DOM text fallback when content attribute is omitted
    const inlineMd = document.createElement('tx-markdown-view')
    inlineMd.setAttribute('sanitize', 'false')
    inlineMd.textContent = '## Inline Fallback'
    document.body.appendChild(inlineMd)
    await nextTick()
    expect(inlineMd.querySelector('h2')?.textContent).toBe('Inline Fallback')
  })
})
