import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import mermaid from 'mermaid'
import TxMermaidBlock from '../src/TxMermaidBlock.vue'

vi.mock('mermaid', () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn(async () => ({ svg: '<svg data-mock="diagram"></svg>' })),
  },
}))

vi.mock('../src/shiki-runtime', () => ({
  highlightToHtml: vi.fn(async () => null),
}))

const renderMock = vi.mocked(mermaid.render)
const initializeMock = vi.mocked(mermaid.initialize)

afterEach(() => {
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

enableAutoUnmount(afterEach)

beforeEach(() => {
  renderMock.mockClear()
  initializeMock.mockClear()
  renderMock.mockImplementation(async () => ({ svg: '<svg data-mock="diagram"></svg>', diagramType: 'flowchart' }))
  vi.spyOn(window, 'matchMedia').mockImplementation(query => ({
    matches: query === '(prefers-reduced-motion: reduce)',
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }))
})

describe('txMermaidBlock', () => {
  it('stays on the skeleton with the draft source while the fence is open', async () => {
    const wrapper = mount(TxMermaidBlock, {
      props: { code: 'graph TD', closed: false, streaming: true },
    })

    await flushPromises()

    expect(wrapper.find('.tx-mermaid-block__skeleton').exists()).toBe(true)
    expect(wrapper.find('.tx-mermaid-block__draft').text()).toContain('graph TD')
    expect(renderMock).not.toHaveBeenCalled()
  })

  it('renders the diagram once the fence closes, under strict security', async () => {
    const wrapper = mount(TxMermaidBlock, {
      props: { code: 'graph TD\nA-->B', closed: true },
    })

    await flushPromises()

    expect(initializeMock).toHaveBeenCalledWith(
      expect.objectContaining({ securityLevel: 'strict', startOnLoad: false }),
    )
    expect(renderMock).toHaveBeenCalledTimes(1)
    expect(wrapper.find('[data-mock="diagram"]').exists()).toBe(true)
    expect(wrapper.find('.tx-mermaid-block__skeleton').exists()).toBe(false)
  })

  it('threads the theme through an init directive instead of global config', async () => {
    mount(TxMermaidBlock, {
      props: { code: 'graph TD', closed: true, theme: 'dark' },
    })

    await flushPromises()

    const source = renderMock.mock.calls[0]?.[1] ?? ''
    expect(source).toContain('%%{init: {"theme": "dark"}}%%')
    expect(source).toContain('graph TD')
  })

  it('falls back to the source code with an alert when rendering fails', async () => {
    renderMock.mockRejectedValueOnce(new Error('parse error'))
    const wrapper = mount(TxMermaidBlock, {
      props: { code: 'not a diagram', closed: true },
    })

    await flushPromises()

    expect(wrapper.find('[role="alert"]').exists()).toBe(true)
    expect(wrapper.findComponent({ name: 'TxCodeBlock' }).props('code')).toBe('not a diagram')
    expect(wrapper.find('[data-mock="diagram"]').exists()).toBe(false)
  })

  it('re-renders when the theme flips on a settled diagram', async () => {
    const wrapper = mount(TxMermaidBlock, {
      props: { code: 'graph TD', closed: true, theme: 'light' },
    })
    await flushPromises()
    expect(renderMock).toHaveBeenCalledTimes(1)

    await wrapper.setProps({ theme: 'dark' })
    await flushPromises()
    expect(renderMock).toHaveBeenCalledTimes(2)
  })

  it.each(['Escape', 'close button'] as const)('opens the diagram in the shared preview and closes via %s', async (closeWith) => {
    const svg = '<svg viewBox="0 0 200 100"><text>Rendered flowchart</text></svg>'
    renderMock.mockResolvedValueOnce({ svg, diagramType: 'flowchart' })
    const wrapper = mount(TxMermaidBlock, {
      props: {
        code: 'graph TD; A-->B',
        closed: true,
        previewLabel: 'Expanded flowchart',
        closeLabel: 'Dismiss flowchart',
      },
      attachTo: document.body,
    })
    await flushPromises()
    expect(document.body.querySelector('[role="dialog"]')).toBeNull()

    const figure = wrapper.find('.tx-mermaid-block__figure')
    await figure.trigger('click')
    await flushPromises()

    const dialog = document.body.querySelector<HTMLElement>('.tx-image-preview[role="dialog"]')!
    expect(dialog.getAttribute('aria-label')).toContain('Expanded flowchart')
    expect(dialog.querySelector('.tx-image-preview__custom svg')?.outerHTML).toBe(svg)
    expect(dialog.querySelector('.tx-image-preview__failed')).toBeNull()

    if (closeWith === 'Escape')
      dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    else
      dialog.querySelector<HTMLButtonElement>('button[aria-label="Dismiss flowchart"]')!.click()
    await flushPromises()

    expect(document.body.querySelector('.tx-image-preview[role="dialog"]')).toBeNull()
    expect(document.activeElement).toBe(figure.element)
  })

  it('gives every diagram a distinct render id across instances', async () => {
    const a = mount(TxMermaidBlock, { props: { code: 'graph TD; A-->B', closed: true } })
    await flushPromises()
    const b = mount(TxMermaidBlock, { props: { code: 'graph TD; C-->D', closed: true } })
    await flushPromises()

    const ids = renderMock.mock.calls.map(call => call[0])
    expect(ids).toHaveLength(2)
    // The counter must be module-scoped: a `<script setup>` local would restart at 0
    // per instance and hand both blocks 'tx-mermaid-1', colliding every SVG id
    // mermaid derives from it.
    expect(new Set(ids).size).toBe(2)

    a.unmount()
    b.unmount()
  })
})
