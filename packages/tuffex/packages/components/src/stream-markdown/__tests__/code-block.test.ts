import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import TxCodeBlock from '../src/TxCodeBlock.vue'
import { highlightToHtml } from '../src/shiki-runtime'

vi.mock('../src/shiki-runtime', () => ({
  highlightToHtml: vi.fn(),
}))

const highlightMock = vi.mocked(highlightToHtml)

beforeEach(() => {
  highlightMock.mockReset()
  highlightMock.mockResolvedValue('<pre class="shiki"><code>highlighted</code></pre>')
})

describe('txCodeBlock', () => {
  it('renders escaped plain text and skips highlighting while the fence is open', async () => {
    const wrapper = mount(TxCodeBlock, {
      props: { lang: 'js', code: 'const a = "<b>"', closed: false, streaming: true },
    })

    await flushPromises()

    const plain = wrapper.find('pre.tx-code-block__plain')
    expect(plain.exists()).toBe(true)
    expect(plain.text()).toContain('const a = "<b>"')
    expect(plain.find('b').exists()).toBe(false)
    expect(highlightMock).not.toHaveBeenCalled()
  })

  it('highlights once the fence closes', async () => {
    const wrapper = mount(TxCodeBlock, {
      props: { lang: 'js', code: 'const a = 1', closed: true, theme: 'dark' },
    })

    await flushPromises()

    expect(highlightMock).toHaveBeenCalledWith('const a = 1', 'js', 'dark')
    expect(wrapper.find('pre.shiki').exists()).toBe(true)
    expect(wrapper.find('pre.tx-code-block__plain').exists()).toBe(false)
  })

  it('stays plain when the runtime degrades', async () => {
    highlightMock.mockResolvedValue(null)
    const wrapper = mount(TxCodeBlock, {
      props: { lang: 'unknownlang', code: 'plain', closed: true },
    })

    await flushPromises()

    expect(wrapper.find('pre.tx-code-block__plain').exists()).toBe(true)
  })

  it('labels bare fences as text and never asks shiki about them', async () => {
    const wrapper = mount(TxCodeBlock, {
      props: { lang: '', code: 'no lang', closed: true },
    })

    await flushPromises()

    expect(wrapper.find('.tx-code-block__lang').text()).toBe('text')
    expect(highlightMock).not.toHaveBeenCalled()
  })

  it('ignores a stale highlight resolving after the code changed', async () => {
    let releaseFirst: (html: string | null) => void = () => {}
    highlightMock.mockImplementationOnce(
      () => new Promise((resolve) => {
        releaseFirst = resolve
      }),
    )

    const wrapper = mount(TxCodeBlock, {
      props: { lang: 'js', code: 'first', closed: true },
    })
    await flushPromises()

    highlightMock.mockResolvedValueOnce('<pre class="shiki"><code>second</code></pre>')
    await wrapper.setProps({ code: 'second' })
    await flushPromises()
    expect(wrapper.find('.tx-code-block__body').text()).toContain('second')

    // The first request resolves late — it must not clobber the newer output.
    releaseFirst('<pre class="shiki"><code>first</code></pre>')
    await flushPromises()
    expect(wrapper.find('.tx-code-block__body').text()).toContain('second')
  })

  it('exposes the code to the copy button', () => {
    const wrapper = mount(TxCodeBlock, {
      props: { lang: 'js', code: 'copy me', closed: true },
    })

    const copy = wrapper.findComponent({ name: 'TxCopyButton' })
    expect(copy.exists()).toBe(true)
    expect(copy.props('text')).toBe('copy me')
  })
})
