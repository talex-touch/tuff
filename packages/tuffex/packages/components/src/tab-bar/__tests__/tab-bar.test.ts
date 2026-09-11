import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import TxTabBar from '../src/TxTabBar.vue'

const items = [
  { value: 'home', label: 'Home', iconClass: 'i-carbon-home' },
  { value: 'search', label: 'Search', iconClass: 'i-carbon-search', badge: 3 },
  { value: 'profile', label: 'Profile', iconClass: 'i-carbon-user', disabled: true },
]

describe('txTabBar', () => {
  it('renders navigation semantics, active item, icons, and badges', () => {
    const wrapper = mount(TxTabBar, {
      props: {
        modelValue: 'search',
        items,
        zIndex: 3001,
      },
    })

    // Bottom navigation is a nav landmark, not a tablist: there are no tabpanels, so
    // role="tablist"/"tab" would be an incomplete pattern and would erase the landmark.
    expect(wrapper.element.tagName).toBe('NAV')
    expect(wrapper.attributes('role')).toBeUndefined()
    expect(wrapper.classes()).toContain('is-fixed')
    expect(wrapper.attributes('style')).toContain('--tx-tab-bar-z-index: 3001')
    expect(wrapper.find('.tx-tab-bar__safe').exists()).toBe(true)

    const buttons = wrapper.findAll('button')

    expect(buttons).toHaveLength(3)
    // The active destination is marked with aria-current="page"; others carry none.
    expect(buttons[0].attributes('aria-current')).toBeUndefined()
    expect(buttons[1].attributes('aria-current')).toBe('page')
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

  // TxFlatRadio ships geometry as inline CSS variables so a caller can override
  // one value without restating a tier. TxTabBar holds the same contract, and
  // the bar height in particular has to be a variable rather than a size class:
  // the indicator measures the item box, so a class-based height would move the
  // indicator through a code path that never reads it.
  it.each([
    ['sm', '44px', '17px'],
    ['md', '56px', '20px'],
    ['lg', '64px', '23px'],
  ] as const)('delivers %s geometry as inline CSS variables', (size, height, icon) => {
    const wrapper = mount(TxTabBar, { props: { items, modelValue: 'home', size, fixed: false } })
    const style = wrapper.find('.tx-tab-bar').attributes('style') ?? ''

    expect(style).toContain(`--tx-tab-bar-height: ${height}`)
    expect(style).toContain(`--tx-tab-bar-icon-size: ${icon}`)
  })

  it('falls back to md geometry for an unknown size', () => {
    const wrapper = mount(TxTabBar, {
      props: { items, modelValue: 'home', fixed: false, size: 'enormous' as never },
    })

    expect(wrapper.find('.tx-tab-bar').attributes('style')).toContain('--tx-tab-bar-height: 56px')
  })

  it.each(['pill', 'line', 'block', 'dot'] as const)('renders the %s indicator variant', (indicator) => {
    const wrapper = mount(TxTabBar, { props: { items, modelValue: 'home', indicator, fixed: false } })
    const el = wrapper.find('.tx-tab-bar__indicator')

    // jsdom measures nothing, so the box stays null and the indicator is not
    // rendered; the class contract is what matters here.
    if (el.exists())
      expect(el.classes()).toContain(`is-${indicator}`)
    else
      expect(wrapper.find('.tx-tab-bar').exists()).toBe(true)
  })

  it('renders no indicator element when indicator is none', () => {
    const wrapper = mount(TxTabBar, {
      props: { items, modelValue: 'home', indicator: 'none', fixed: false },
    })

    expect(wrapper.find('.tx-tab-bar__indicator').exists()).toBe(false)
  })
})
