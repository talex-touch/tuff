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

  it('keeps keyboard activation working after an aborted menu press', async () => {
    const spy = vi.fn()
    const wrapper = mount(SplitButton, {
      attrs: { onMenuOpenChange: spy },
      slots: {
        default: 'Run',
        menu: () => 'Menu',
      },
      global: { stubs: { TxPopover: PopoverStub } },
    })

    const menuBtn = wrapper.find('button.tx-split-button__menu')

    // Aborted press: pointerdown opens the menu, but the release happens
    // off-target so no paired click is ever dispatched on the button.
    await menuBtn.trigger('pointerdown')
    expect(spy).toHaveBeenLastCalledWith(true)

    // Keyboard activation must still toggle — a wedged click-guard used to swallow it.
    await menuBtn.trigger('keydown', { key: 'Enter' })
    expect(spy).toHaveBeenLastCalledWith(false)
  })
})

// The real TxPopover is mounted with `toggle-on-reference-click=false`: it never
// toggles on its own, so whatever state these tests see is the trigger's doing.
const PassivePopoverStub = defineComponent({
  name: 'TxPopover',
  props: {
    modelValue: { type: Boolean, default: false },
  },
  template: `
    <div>
      <slot name="reference" />
      <div v-if="modelValue" class="passive-popover__panel"><slot /></div>
    </div>
  `,
})

describe('txSplitButton menu press', () => {
  function mountWithMenu() {
    const spy = vi.fn()
    const wrapper = mount(SplitButton, {
      attrs: { onMenuOpenChange: spy },
      slots: { default: 'Run', menu: () => 'Menu' },
      global: { stubs: { TxPopover: PassivePopoverStub } },
    })
    return { wrapper, spy, menuBtn: wrapper.find('button.tx-split-button__menu') }
  }

  it('stays open after an ordinary click, whose click event arrives on release', async () => {
    vi.useFakeTimers()
    try {
      const { wrapper, spy, menuBtn } = mountWithMenu()
      await menuBtn.trigger('pointerdown')
      // a real press: the button is held ~100ms before the release and its click
      vi.advanceTimersByTime(120)
      window.dispatchEvent(new Event('pointerup'))
      await menuBtn.trigger('click')
      vi.advanceTimersByTime(600)
      await wrapper.vm.$nextTick()

      expect(spy).toHaveBeenLastCalledWith(true)
      expect(wrapper.find('.passive-popover__panel').exists()).toBe(true)
    }
    finally {
      vi.useRealTimers()
    }
  })

  it('stops swallowing clicks once a press is released off the trigger', async () => {
    vi.useFakeTimers()
    try {
      const { spy, menuBtn } = mountWithMenu()
      await menuBtn.trigger('pointerdown')
      expect(spy).toHaveBeenLastCalledWith(true)
      // released elsewhere: no click follows on the trigger
      window.dispatchEvent(new Event('pointerup'))
      vi.advanceTimersByTime(600)
      // a later click with no press of its own (assistive tech) still toggles
      await menuBtn.trigger('click')
      expect(spy).toHaveBeenLastCalledWith(false)
    }
    finally {
      vi.useRealTimers()
    }
  })
})

describe('txSplitButton menu icon', () => {
  it('draws its own glyph when no icon class is given', () => {
    const wrapper = mount(SplitButton, {
      slots: { default: 'Run', menu: () => 'Menu' },
      global: { stubs: { TxPopover: PassivePopoverStub } },
    })
    expect(wrapper.find('svg.tx-split-button__menu-glyph').exists()).toBe(true)
    expect(wrapper.find('i.tx-split-button__menu-icon').exists()).toBe(false)
  })

  it('uses the icon class when one is given', () => {
    const wrapper = mount(SplitButton, {
      props: { menuIcon: 'i-carbon-chevron-down' },
      slots: { default: 'Run', menu: () => 'Menu' },
      global: { stubs: { TxPopover: PassivePopoverStub } },
    })
    expect(wrapper.find('i.tx-split-button__menu-icon.i-carbon-chevron-down').exists()).toBe(true)
    expect(wrapper.find('svg.tx-split-button__menu-glyph').exists()).toBe(false)
  })
})
