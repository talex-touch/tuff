import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import TxNavBar from '../src/TxNavBar.vue'

describe('txNavBar', () => {
  it('renders title, safe area, and z-index variable', () => {
    const wrapper = mount(TxNavBar, {
      props: {
        title: 'Settings',
        zIndex: 3200,
      },
    })

    expect(wrapper.text()).toContain('Settings')
    expect(wrapper.find('.tx-nav-bar__safe').exists()).toBe(true)
    expect(wrapper.attributes('style')).toContain('--tx-nav-bar-z-index: 3200')
  })

  it('maps fixed, disabled, and safe area props to classes and structure', () => {
    const wrapper = mount(TxNavBar, {
      props: {
        fixed: true,
        disabled: true,
        safeAreaTop: false,
      },
    })

    expect(wrapper.classes()).toContain('is-fixed')
    expect(wrapper.classes()).toContain('is-disabled')
    expect(wrapper.find('.tx-nav-bar__safe').exists()).toBe(false)
  })

  it('emits back and left events from the default back button', async () => {
    const wrapper = mount(TxNavBar, {
      props: {
        showBack: true,
      },
    })

    const left = wrapper.find('.tx-nav-bar__left')
    expect(left.element.tagName).toBe('BUTTON')
    expect(left.attributes('aria-label')).toBe('Back')

    await left.trigger('click')

    expect(wrapper.emitted('back')).toHaveLength(1)
    expect(wrapper.emitted('click-left')).toHaveLength(1)
  })

  it('emits left and right events from custom slots', async () => {
    const wrapper = mount(TxNavBar, {
      slots: {
        left: '<button class="custom-left">Menu</button>',
        title: '<strong>Custom title</strong>',
        right: '<button class="custom-right">Done</button>',
      },
    })

    expect(wrapper.text()).toContain('Custom title')

    const left = wrapper.find('.tx-nav-bar__left')
    const right = wrapper.find('.tx-nav-bar__right')
    expect(left.element.tagName).toBe('BUTTON')
    expect(right.element.tagName).toBe('BUTTON')

    await left.trigger('click')
    await right.trigger('click')

    expect(wrapper.emitted('click-left')).toHaveLength(1)
    expect(wrapper.emitted('click-right')).toHaveLength(1)
  })

  it('keeps empty action zones disabled and non-emitting', async () => {
    const wrapper = mount(TxNavBar)
    const left = wrapper.find('.tx-nav-bar__left')
    const right = wrapper.find('.tx-nav-bar__right')

    expect(left.attributes('disabled')).toBeDefined()
    expect(right.attributes('disabled')).toBeDefined()

    await left.trigger('click')
    await right.trigger('click')

    expect(wrapper.emitted('click-left')).toBeUndefined()
    expect(wrapper.emitted('click-right')).toBeUndefined()
  })

  it('does not emit events when disabled', async () => {
    const wrapper = mount(TxNavBar, {
      props: {
        showBack: true,
        disabled: true,
      },
    })

    await wrapper.find('.tx-nav-bar__left').trigger('click')
    await wrapper.find('.tx-nav-bar__right').trigger('click')

    expect(wrapper.find('.tx-nav-bar__left').attributes('disabled')).toBeDefined()
    expect(wrapper.find('.tx-nav-bar__right').attributes('disabled')).toBeDefined()
    expect(wrapper.emitted('back')).toBeUndefined()
    expect(wrapper.emitted('click-left')).toBeUndefined()
    expect(wrapper.emitted('click-right')).toBeUndefined()
  })
})
