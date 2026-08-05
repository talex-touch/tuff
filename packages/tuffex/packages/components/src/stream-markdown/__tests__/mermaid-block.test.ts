import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
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

beforeEach(() => {
  renderMock.mockClear()
  initializeMock.mockClear()
  renderMock.mockImplementation(async () => ({ svg: '<svg data-mock="diagram"></svg>' } as any))
  document.body.innerHTML = ''
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

  it('opens the zoom overlay from the figure button and closes on Escape', async () => {
    const wrapper = mount(TxMermaidBlock, {
      props: { code: 'graph TD', closed: true },
    })
    await flushPromises()

    await wrapper.find('.tx-mermaid-block__figure').trigger('click')
    expect(document.body.querySelector('.tx-mermaid-block__overlay')).not.toBeNull()

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await flushPromises()
    expect(document.body.querySelector('.tx-mermaid-block__overlay')).toBeNull()
  })
})
