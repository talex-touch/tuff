import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import SplitButton from '../src/split-button.vue'

const PopoverStub = defineComponent({
  name: 'TxPopover',
  props: {
    modelValue: { type: Boolean, default: false },
  },
  emits: ['update:modelValue', 'open', 'close'],
  template: `
    <div>
      <div class="tx-popover-stub__reference" @click="$emit('update:modelValue', !modelValue)">
        <slot name="reference" />
      </div>
      <div v-if="modelValue">
        <slot />
      </div>
    </div>
  `,
})

describe('txSplitButton', () => {
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
        stubs: { TxPopover: PopoverStub },
      },
    })

    expect(wrapper.find('button.tx-split-button__menu').exists()).toBe(true)
    await wrapper.find('button.tx-split-button__menu').trigger('click')

    // TxPopover stub opens on reference click and renders menu content
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
      global: { stubs: { TxPopover: PopoverStub } },
    })

    await wrapper.find('button.tx-split-button__menu').trigger('click')
    expect(spy).toHaveBeenCalled()
  })
})
