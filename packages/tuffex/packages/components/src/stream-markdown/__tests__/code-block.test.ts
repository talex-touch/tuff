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
  it('renders escaped plain text first, then live-highlights an open fence on a coalescing timer', async () => {
    vi.useFakeTimers()
    try {
      const wrapper = mount(TxCodeBlock, {
        props: { lang: 'js', code: 'const a = "<b>"', closed: false, streaming: true },
      })

      const plain = wrapper.find('pre.tx-code-block__plain')
      expect(plain.exists()).toBe(true)
      expect(plain.text()).toContain('const a = "<b>"')
      expect(plain.find('b').exists()).toBe(false)
      // Not synchronously — a burst of deltas must not trigger a re-tokenize each.
      expect(highlightMock).not.toHaveBeenCalled()

      await wrapper.setProps({ code: 'const a = "<b>";\nconst b = 2' })
      await wrapper.setProps({ code: 'const a = "<b>";\nconst b = 2;\nconst c = 3' })
      expect(highlightMock).not.toHaveBeenCalled()

      // One pass for the whole burst once the interval elapses.
      await vi.advanceTimersByTimeAsync(150)
      expect(highlightMock).toHaveBeenCalledTimes(1)
      expect(highlightMock).toHaveBeenCalledWith(
        expect.stringContaining('const c = 3'),
        'js',
        'light',
      )
    }
    finally {
      vi.useRealTimers()
    }
  })

  it('clears the pending live-highlight timer on unmount', async () => {
    vi.useFakeTimers()
    try {
      const wrapper = mount(TxCodeBlock, {
        props: { lang: 'js', code: 'const a = 1', closed: false, streaming: true },
      })
      wrapper.unmount()
      await vi.advanceTimersByTimeAsync(500)
      expect(highlightMock).not.toHaveBeenCalled()
    }
    finally {
      vi.useRealTimers()
    }
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

  it('offers a sandboxed preview for settled markup fences only', async () => {
    const wrapper = mount(TxCodeBlock, {
      props: { lang: 'html', code: '<h1>hey</h1>', closed: true },
    })
    await flushPromises()

    const toggle = wrapper.find('.tx-code-block__toggle')
    expect(toggle.exists()).toBe(true)
    expect(toggle.text()).toBe('Preview')
    expect(wrapper.find('iframe').exists()).toBe(false)

    await toggle.trigger('click')
    const frame = wrapper.find('iframe.tx-code-block__preview')
    expect(frame.exists()).toBe(true)
    // Empty sandbox: no scripts, no same-origin — markup only.
    expect(frame.attributes('sandbox')).toBe('')
    expect(frame.attributes('srcdoc')).toContain('<h1>hey</h1>')
    expect(wrapper.find('.tx-code-block__toggle').text()).toBe('Code')
  })

  it('wraps svg previews in a centring document', async () => {
    const wrapper = mount(TxCodeBlock, {
      props: { lang: 'svg', code: '<svg viewBox="0 0 1 1"></svg>', closed: true },
    })
    await flushPromises()
    await wrapper.find('.tx-code-block__toggle').trigger('click')

    const srcdoc = wrapper.find('iframe').attributes('srcdoc') ?? ''
    expect(srcdoc).toContain('<!doctype html>')
    expect(srcdoc).toContain('<svg viewBox="0 0 1 1"></svg>')
  })

  it('never offers a preview for open fences, code languages or opted-out hosts', async () => {
    for (const props of [
      { lang: 'html', code: '<p>x</p>', closed: false, streaming: true },
      { lang: 'js', code: 'alert(1)', closed: true },
      { lang: 'html', code: '<p>x</p>', closed: true, previewable: false },
    ]) {
      const wrapper = mount(TxCodeBlock, { props })
      await flushPromises()
      expect(wrapper.find('.tx-code-block__toggle').exists()).toBe(false)
    }
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
