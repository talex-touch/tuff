import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { h } from 'vue'
import SplitButton from '../src/split-button.vue'

describe('TxSplitButton', () => {
  it('renders label', () => {
    const wrapper = mount(SplitButton, {
      slots: { default: 'Run' },
    })

    expect(wrapper.text()).toContain('Run')
    expect(wrapper.classes()).toContain('tx-split-button')
  })

  it('emits click event', async () => {
    const wrapper = mount(SplitButton)
    await wrapper.find('button.tx-split-button__primary').trigger('click')
    expect(wrapper.emitted('click')).toBeTruthy()
  })

  it('does not emit click when disabled', async () => {
    const wrapper = mount(SplitButton, {
      props: { disabled: true },
    })
    await wrapper.find('button.tx-split-button__primary').trigger('click')
    expect(wrapper.emitted('click')).toBeFalsy()
  })

  it('shows loading spinner', () => {
    const wrapper = mount(SplitButton, {
      props: { loading: true },
    })
    expect(wrapper.classes()).toContain('is-loading')
    expect(wrapper.find('.tx-split-button__spinner').exists()).toBe(true)
  })

  it('renders menu and can open', async () => {
    const wrapper = mount(SplitButton, {
      slots: {
        default: 'Run',
        menu: ({ close }: any) => h('div', { class: 'test-menu', onClick: () => close() }, 'Menu'),
      },
      global: {
        stubs: { Teleport: true },
      },
    })

    expect(wrapper.find('button.tx-split-button__menu').exists()).toBe(true)
    await wrapper.find('button.tx-split-button__menu').trigger('click')

    // TxPopover opens on click; Teleport stub keeps content in tree
    expect(wrapper.find('.test-menu').exists()).toBe(true)
  })

  it('emits menuOpenChange', async () => {
    const spy = vi.fn()
    const wrapper = mount(SplitButton, {
      attrs: { onMenuOpenChange: spy },
      slots: {
        default: 'Run',
        menu: () => 'Menu',
      },
      global: { stubs: { Teleport: true } },
    })

    await wrapper.find('button.tx-split-button__menu').trigger('click')
    expect(spy).toHaveBeenCalled()
  })
})
