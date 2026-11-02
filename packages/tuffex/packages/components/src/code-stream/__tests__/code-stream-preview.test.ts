import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { highlightToHtml } from '../../stream-markdown/src/shiki-runtime'
import TxCodeStream from '../src/TxCodeStream.vue'

vi.mock('../../stream-markdown/src/shiki-runtime', () => ({
  highlightToHtml: vi.fn(async () => null),
}))

const highlight = vi.mocked(highlightToHtml)

async function settle(): Promise<void> {
  await flushPromises()
  await nextTick()
}

describe('txCodeStream rendered markup preview', () => {
  it('toggles an HTML listing into an isolated escaped preview with a strict outer policy', async () => {
    highlight.mockResolvedValue(null)
    const code = '<p title="x">&</p><div data-break="><script>alert(1)</script>">safe</div>'
    const wrapper = mount(TxCodeStream, { props: { code, lang: 'HTML' } })

    const toggle = wrapper.find('.tx-bui-code-stream__toggle')
    expect(toggle.exists()).toBe(true)
    expect(toggle.attributes('aria-pressed')).toBe('false')
    await toggle.trigger('click')
    await settle()

    const frame = wrapper.find('iframe.tx-bui-code-stream__preview')
    expect(frame.exists()).toBe(true)
    expect(toggle.text()).toBe('Code')
    expect(toggle.attributes('aria-pressed')).toBe('true')
    expect(frame.attributes('sandbox')).toBe('')
    expect(frame.attributes('sandbox')).not.toContain('allow-same-origin')

    const srcdoc = frame.attributes('srcdoc')!
    expect(srcdoc).toContain('script-src \'none\'')
    expect(srcdoc).toContain("default-src 'none'")
    expect(srcdoc).not.toContain('connect-src')
    expect(srcdoc.indexOf('http-equiv="Content-Security-Policy"')).toBeGreaterThanOrEqual(0)
    expect(srcdoc.indexOf('<iframe')).toBeGreaterThan(srcdoc.indexOf('http-equiv="Content-Security-Policy"'))
    expect(srcdoc).toContain('&quot;')
    expect(srcdoc).toContain('&amp;')

    const outer = new DOMParser().parseFromString(srcdoc, 'text/html')
    const nested = outer.querySelectorAll('iframe')
    // Negative control: removing `escapeAttribute(inner)` lets the breakout create extra frames and changes this round-trip.
    expect(nested).toHaveLength(1)
    expect(nested[0]!.getAttribute('srcdoc')).toBe(code)
  })

  it('opts scripts into the frame without granting same-origin access', async () => {
    const wrapper = mount(TxCodeStream, {
      props: { code: '<script>window.ok = true</script>', lang: 'xml', previewScripts: true },
    })
    await wrapper.find('.tx-bui-code-stream__toggle').trigger('click')
    await settle()

    const frame = wrapper.find('iframe.tx-bui-code-stream__preview')
    expect(frame.attributes('sandbox')).toBe('allow-scripts')
    const srcdoc = frame.attributes('srcdoc')!
    expect(srcdoc).toContain("script-src 'unsafe-inline'")
    expect(srcdoc).not.toContain('allow-same-origin')
    const nested = new DOMParser().parseFromString(srcdoc, 'text/html').querySelector('iframe')!
    expect(nested.getAttribute('srcdoc')).toContain('<body style="margin:0;display:grid;place-items:center">')
    // Negative control: breaking the SVG/XML wrapper removes the centered body document.
    expect(nested.getAttribute('srcdoc')).toContain('<script>window.ok = true</script>')
  })

  it('auto-opens after streaming settles, permits a user return to code, and closes on language change', async () => {
    const wrapper = mount(TxCodeStream, {
      props: { code: '<main>done</main>', lang: 'html', streaming: true, paced: false, autoPreview: true },
    })
    await settle()
    expect(wrapper.find('.tx-bui-code-stream__toggle').exists()).toBe(false)

    await wrapper.setProps({ streaming: false })
    await settle()
    expect(wrapper.find('iframe.tx-bui-code-stream__preview').exists()).toBe(true)

    await wrapper.setProps({ lang: 'ts' })
    await settle()
    // Negative control: removing the `!allowed` watcher branch leaves the stale preview mounted.
    expect(wrapper.find('.tx-bui-code-stream__toggle').exists()).toBe(false)
    expect(wrapper.find('iframe.tx-bui-code-stream__preview').exists()).toBe(false)

    await wrapper.setProps({ lang: 'html' })
    await settle()
    expect(wrapper.find('iframe.tx-bui-code-stream__preview').exists()).toBe(true)
    await wrapper.find('.tx-bui-code-stream__toggle').trigger('click')
    expect(wrapper.find('.tx-bui-code-stream__scroller').exists()).toBe(true)

  })
  it.each([
    ['TypeScript', { lang: 'ts' }],
    ['disabled', { lang: 'html', previewable: false }],
    ['diff', { lang: 'html', diff: [{ kind: 'context', content: '<p>x</p>', number: 1 }] }],
    ['live stream', { lang: 'html', streaming: true }],
    ['blank source', { lang: 'html', code: '  \n\t' }],
  ] as const)('does not offer preview for %s', async (_, props) => {
    const wrapper = mount(TxCodeStream, { props: { code: '<p>x</p>', ...props } })
    await settle()
    // Negative control: removing any canPreview guard makes this ineligible case expose a toggle.
    expect(wrapper.find('.tx-bui-code-stream__toggle').exists()).toBe(false)
  })
})
