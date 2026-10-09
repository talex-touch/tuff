import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import TxCopyButton from '../src/copy-button.vue'

describe('txCopyButton', () => {
  it('copies text through clipboard api and shows copied state', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })

    const wrapper = mount(TxCopyButton, {
      props: {
        text: 'npm install @talex-touch/tuffex',
      },
    })

    await wrapper.trigger('click')
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(writeText).toHaveBeenCalledWith('npm install @talex-touch/tuffex')
    expect(wrapper.emitted('copy')?.[0]).toEqual(['npm install @talex-touch/tuffex'])
    expect(wrapper.classes()).toContain('is-copied')
    expect(wrapper.text()).toContain('Copied')
  })

  it('does not copy when disabled', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })

    const wrapper = mount(TxCopyButton, {
      props: {
        text: 'blocked',
        disabled: true,
      },
    })

    await wrapper.trigger('click')

    expect(writeText).not.toHaveBeenCalled()
    expect(wrapper.emitted('copy')).toBeUndefined()
  })

  it('emits error when copy fails', async () => {
    const error = new Error('denied')
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockRejectedValue(error) },
    })

    const wrapper = mount(TxCopyButton, {
      props: {
        text: 'secret',
      },
    })

    await wrapper.trigger('click')
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(wrapper.emitted('error')?.[0]).toEqual([error])
  })

  it('removes the fallback textarea even when execCommand throws', async () => {
    // Force the execCommand fallback path (no async clipboard API).
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: undefined,
    })
    // jsdom does not implement execCommand, so define it before forcing it to throw.
    const originalExec = (document as any).execCommand
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      writable: true,
      value: vi.fn(() => {
        throw new Error('execCommand blew up')
      }),
    })

    const wrapper = mount(TxCopyButton, {
      props: { text: 'orphan-me' },
    })

    await wrapper.trigger('click')
    await new Promise(resolve => setTimeout(resolve, 0))

    // The copy failed (error emitted), but no hidden textarea may be left on <body>.
    expect(wrapper.emitted('error')).toBeTruthy()
    expect(document.body.querySelector('textarea')).toBeNull()

    if (originalExec)
      (document as any).execCommand = originalExec
    else
      delete (document as any).execCommand
  })

  it('announces copy success through a polite live region', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })

    const wrapper = mount(TxCopyButton, {
      props: { text: 'hello', copiedLabel: 'Copied!' },
    })

    const status = wrapper.find('.tx-copy-button__status')
    // Pre-fix there was no live region — success was only a visual label / aria-label
    // swap that assistive tech never re-announces.
    expect(status.attributes('role')).toBe('status')
    expect(status.attributes('aria-live')).toBe('polite')
    expect(status.text()).toBe('')

    await wrapper.trigger('click')
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(status.text()).toBe('Copied!')
  })
})

describe('txCopyButton states', () => {
  function stubClipboard(writeText: (text: string) => Promise<void>) {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
  }
  const settle = () => new Promise(resolve => setTimeout(resolve, 0))

  it('reports a failure in the icon and tone, keeping the label when failedLabel is unset', async () => {
    stubClipboard(vi.fn().mockRejectedValue(new Error('denied')))
    const wrapper = mount(TxCopyButton, { props: { text: 'x', copyLabel: '复制' } })

    await wrapper.trigger('click')
    await settle()

    expect(wrapper.classes()).toContain('is-failed')
    expect(wrapper.attributes('aria-label')).toBe('复制')
    // a wrapper that never passes failedLabel must not surface English text
    expect(wrapper.find('.tx-copy-button__label').text()).not.toContain('fail')
    expect(wrapper.find('.tx-copy-button__status').text()).toBe('Copy failed')
  })

  it('shows failedLabel when one is given', async () => {
    stubClipboard(vi.fn().mockRejectedValue(new Error('denied')))
    const wrapper = mount(TxCopyButton, { props: { text: 'x', failedLabel: '复制失败' } })

    await wrapper.trigger('click')
    await settle()

    expect(wrapper.attributes('aria-label')).toBe('复制失败')
    expect(wrapper.find('.tx-copy-button__status').text()).toBe('复制失败')
  })

  it('icon only: no label at rest, the copied label while reporting, its name always', async () => {
    vi.useFakeTimers()
    try {
      stubClipboard(vi.fn().mockResolvedValue(undefined))
      const wrapper = mount(TxCopyButton, { props: { text: 'x', iconOnly: true, timeout: 1000 } })

      expect(wrapper.classes()).toContain('is-icon-only')
      expect(wrapper.classes()).not.toContain('has-label')
      expect(wrapper.attributes('aria-label')).toBe('Copy')

      await wrapper.trigger('click')
      await vi.advanceTimersByTimeAsync(0)
      expect(wrapper.classes()).toContain('has-label')
      expect(wrapper.find('.tx-copy-button__label').text()).toContain('Copied')

      await vi.advanceTimersByTimeAsync(1000)
      expect(wrapper.classes()).not.toContain('is-copied')
      expect(wrapper.classes()).not.toContain('has-label')
    }
    finally {
      vi.useRealTimers()
    }
  })

  it('eases colour only inside the window after a state change', async () => {
    vi.useFakeTimers()
    try {
      stubClipboard(vi.fn().mockResolvedValue(undefined))
      const wrapper = mount(TxCopyButton, { props: { text: 'x', timeout: 2000 } })
      expect(wrapper.classes()).not.toContain('is-morphing')

      await wrapper.trigger('click')
      await vi.advanceTimersByTimeAsync(0)
      expect(wrapper.classes()).toContain('is-morphing')

      await vi.advanceTimersByTimeAsync(420)
      expect(wrapper.classes()).toContain('is-copied')
      expect(wrapper.classes()).not.toContain('is-morphing')

      // the reset back to idle is a state change too
      await vi.advanceTimersByTimeAsync(1600)
      expect(wrapper.classes()).not.toContain('is-copied')
      expect(wrapper.classes()).toContain('is-morphing')
    }
    finally {
      vi.useRealTimers()
    }
  })
})

describe('txCopyButton icon-only width', () => {
  // jsdom has neither layout nor the Web Animations API. The button's width is
  // modelled from what it shows (14px padding, a 16px glyph, then a 6px gap and
  // 8px per character of the label in flow), and the stub records each tween.
  interface AnimateCall { element: HTMLElement, keyframes: Keyframe[] }
  let calls: AnimateCall[]

  beforeEach(() => {
    calls = []
    Object.defineProperty(HTMLElement.prototype, 'animate', {
      configurable: true,
      value(this: HTMLElement, keyframes: Keyframe[]) {
        calls.push({ element: this, keyframes })
        return { cancel: vi.fn(), onfinish: null } as unknown as Animation
      },
    })
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      let width = 0
      if (this.classList.contains('tx-copy-button')) {
        const label = this.querySelector('.tx-text-transformer__layer--current')?.textContent?.trim() ?? ''
        width = 14 + 16 + (label ? 6 + label.length * 8 : 0)
      }
      return { x: 0, y: 0, top: 0, left: 0, right: width, bottom: 30, width, height: 30, toJSON: () => ({}) } as DOMRect
    })
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn().mockResolvedValue(undefined) } })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    Reflect.deleteProperty(HTMLElement.prototype, 'animate')
  })

  const widths = (call: AnimateCall) => call.keyframes.map(k => k.width)

  it('tweens its own width out to the label and back', async () => {
    vi.useFakeTimers()
    const wrapper = mount(TxCopyButton, { props: { text: 'x', iconOnly: true, copiedLabel: 'Copied', timeout: 1000 } })

    await wrapper.trigger('click')
    await vi.advanceTimersByTimeAsync(0)
    const grow = calls.filter(c => c.element === wrapper.element)
    expect(grow.map(widths)).toEqual([['30px', '84px']])
    expect(wrapper.classes()).toContain('is-resizing')

    await vi.advanceTimersByTimeAsync(1000)
    const shrink = calls.filter(c => c.element === wrapper.element).slice(1)
    expect(shrink.map(widths)).toEqual([['84px', '30px']])
    wrapper.unmount()
  })

  it('leaves the labelled button to the morph, which tweens its own width', async () => {
    vi.useFakeTimers()
    const wrapper = mount(TxCopyButton, { props: { text: 'x', copyLabel: 'Copy', copiedLabel: 'Copied' } })

    await wrapper.trigger('click')
    await vi.advanceTimersByTimeAsync(0)
    expect(calls.filter(c => c.element === wrapper.element)).toEqual([])
    wrapper.unmount()
  })
})
