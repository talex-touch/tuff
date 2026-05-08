import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import TxTabBar from '../src/TxTabBar.vue'

const items = [
  { value: 'home', label: 'Home', iconClass: 'i-carbon-home' },
  { value: 'search', label: 'Search', iconClass: 'i-carbon-search', badge: 3 },
  { value: 'profile', label: 'Profile', iconClass: 'i-carbon-user', disabled: true },
]

describe('txTabBar', () => {
  it('renders tablist semantics, active item, icons, and badges', () => {
    const wrapper = mount(TxTabBar, {
      props: {
        modelValue: 'search',
        items,
        zIndex: 3001,
      },
    })

    expect(wrapper.attributes('role')).toBe('tablist')
    expect(wrapper.classes()).toContain('is-fixed')
    expect(wrapper.attributes('style')).toContain('--tx-tab-bar-z-index: 3001')
    expect(wrapper.find('.tx-tab-bar__safe').exists()).toBe(true)

    const buttons = wrapper.findAll('button')

    expect(buttons).toHaveLength(3)
    expect(buttons[0].attributes('aria-selected')).toBe('false')
    expect(buttons[1].attributes('aria-selected')).toBe('true')
    expect(buttons[1].classes()).toContain('is-active')
    expect(buttons[1].find('.i-carbon-search').exists()).toBe(true)
    expect(buttons[1].find('.tx-tab-bar__badge').text()).toBe('3')
    expect(buttons[2].attributes('disabled')).toBeDefined()
    expect(buttons[2].classes()).toContain('is-item-disabled')
  })

  it('can render as an unfixed bar without safe-area spacer', () => {
    const wrapper = mount(TxTabBar, {
      props: {
        items,
        fixed: false,
        safeAreaBottom: false,
      },
    })

    expect(wrapper.classes()).not.toContain('is-fixed')
    expect(wrapper.find('.tx-tab-bar__safe').exists()).toBe(false)
  })

  it('emits model and change events when an enabled tab is picked', async () => {
    const wrapper = mount(TxTabBar, {
      props: {
        modelValue: 'home',
        items,
      },
    })

    await wrapper.findAll('button')[1].trigger('click')

    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['search'])
    expect(wrapper.emitted('change')?.[0]).toEqual(['search'])
  })

  it('does not emit when the bar or item is disabled', async () => {
    const disabledBar = mount(TxTabBar, {
      props: {
        modelValue: 'home',
        items,
        disabled: true,
      },
    })

    await disabledBar.findAll('button')[1].trigger('click')

    expect(disabledBar.classes()).toContain('is-disabled')
    expect(disabledBar.findAll('button')[1].attributes('disabled')).toBeDefined()
    expect(disabledBar.emitted('update:modelValue')).toBeUndefined()

    const disabledItem = mount(TxTabBar, {
      props: {
        modelValue: 'home',
        items,
      },
    })

    await disabledItem.findAll('button')[2].trigger('click')

    expect(disabledItem.emitted('update:modelValue')).toBeUndefined()
  })
})
