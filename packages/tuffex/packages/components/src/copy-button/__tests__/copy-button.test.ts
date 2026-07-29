import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import TxCopyButton from '../src/TxCopyButton.vue'

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
