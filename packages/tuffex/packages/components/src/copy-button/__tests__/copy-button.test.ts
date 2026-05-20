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
})
