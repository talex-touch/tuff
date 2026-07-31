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
        // Slot content stays non-interactive: the action zone is itself the button that
        // emits the event, and the docs forbid nesting another interactive control here.
        left: '<span class="custom-left">Menu</span>',
        title: '<strong>Custom title</strong>',
        right: '<span class="custom-right">Done</span>',
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

  it('lets a provided right slot name the button instead of a hardcoded label', () => {
    const wrapper = mount(TxNavBar, {
      slots: { right: '<span>Save</span>' },
    })

    // Pre-fix the right button hardcoded aria-label="Navigation right action",
    // which overrode the slot's "Save" accessible name. With a slot present the
    // button must expose no competing aria-label.
    expect(wrapper.find('.tx-nav-bar__right').attributes('aria-label')).toBeUndefined()
  })

  it('localizes the built-in back and right action labels', () => {
    const back = mount(TxNavBar, {
      props: { showBack: true, backLabel: '返回' },
    })
    // Pre-fix the back label was the hardcoded literal 'Back'.
    expect(back.find('.tx-nav-bar__left').attributes('aria-label')).toBe('返回')

    const right = mount(TxNavBar, {
      props: { rightLabel: '保存' },
    })
    // No right slot, so the localized fallback names the button.
    expect(right.find('.tx-nav-bar__right').attributes('aria-label')).toBe('保存')
  })
})
