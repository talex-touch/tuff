import { flushPromises, mount } from '@vue/test-utils'
import { Fragment, defineAsyncComponent, defineComponent, h, nextTick, ref } from 'vue'
import { describe, expect, it } from 'vitest'
import TxTabHeader from '../src/TxTabHeader.vue'
import TxTabItem from '../src/TxTabItem.vue'
import TxTabItemGroup from '../src/TxTabItemGroup.vue'
import TxTabs from '../src/TxTabs.vue'

const AutoSizerStub = defineComponent({
  name: 'TxAutoSizer',
  props: {
    width: Boolean,
    height: Boolean,
    durationMs: Number,
    easing: String,
    outerClass: String,
    observeTarget: String,
  },
  setup(_props, { expose, slots }) {
    expose({
      refresh: () => undefined,
      flip: async (action: () => void | Promise<void>) => action(),
      action: async (fn: (el?: HTMLElement) => void | Promise<void>) => {
        await fn(undefined)
        return { changedKeys: [] }
      },
      // Real TxAutoSizer exposes `size` as a Ref (Vue's expose proxy unwraps it via
      // proxyRefs). The stub must expose a genuine ref so it reflects that unwrapping;
      // a plain `{ value: ... }` object would mask the double-unwrap bug (issue #460).
      size: ref({ width: 320, height: 180 }),
    })
    return () => h('div', { class: 'auto-sizer-stub' }, slots.default?.())
  },
})

function mountTabs(props: Record<string, unknown> = {}) {
  return mount(TxTabs, {
    props,
    global: {
      stubs: {
        TxAutoSizer: AutoSizerStub,
      },
    },
    slots: {
      default: () => [
        h(TxTabHeader, null, {
          default: ({ props: headerProps }: any) => h('div', { class: 'active-header' }, headerProps.node?.props?.name),
        }),
        h(TxTabItem, { name: 'General', iconClass: 'i-general', activation: true }, {
          name: () => '概览',
          default: () => 'General content',
        }),
        h(TxTabItemGroup, { name: 'Advanced' }, {
          default: () => [
            h(TxTabItem, { name: 'Network', iconClass: 'i-network' }, {
              name: () => '网络',
              default: () => 'Network content',
            }),
            h(TxTabItem, { name: 'Disabled', disabled: true }, {
              default: () => 'Disabled content',
            }),
          ],
        }),
      ],
      'nav-right': () => h('button', { class: 'nav-action' }, 'New'),
    },
  })
}

describe('txTabs', () => {
  it('renders activation tab, grouped nav items, header, and nav-right slot', async () => {
    const wrapper = mountTabs({
      placement: 'top',
      indicatorVariant: 'pill',
      indicatorMotion: 'warp',
      indicatorMotionStrength: -2,
      borderless: true,
    })

    await nextTick()

    expect(wrapper.classes()).toContain('tx-tabs--top')
    expect(wrapper.classes()).toContain('tx-tabs--indicator-pill')
    expect(wrapper.classes()).toContain('tx-tabs--motion-warp')
    expect(wrapper.classes()).toContain('tx-tabs--borderless')
    expect(wrapper.classes()).toContain('tx-tabs--indicator-pending')
    expect(wrapper.classes()).not.toContain('tx-tabs--indicator-visible')
    expect(wrapper.attributes('style')).toContain('--tx-tabs-indicator-duration: 350ms')
    expect(wrapper.attributes('style')).toContain('--tx-tabs-indicator-easing: cubic-bezier(0.25, 0.46, 0.45, 0.94)')
    expect(wrapper.attributes('style')).toContain('--tx-tabs-indicator-strength: 0')
    expect(wrapper.find('.tx-tabs__group-name').text()).toBe('Advanced')
    expect(wrapper.find('.nav-action').exists()).toBe(true)
    expect(wrapper.find('.active-header').text()).toBe('General')
    expect(wrapper.findAll('.tx-tab-item__name').map(item => item.text())).toEqual([
      '概览',
      '网络',
      'Disabled',
    ])
    expect(wrapper.find('.tx-tabs__content-scroll').exists()).toBe(true)
    expect(wrapper.find('.tx-tabs__pointer').exists()).toBe(true)
    expect(wrapper.text()).toContain('General content')
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['General'])
    expect(wrapper.emitted('change')?.[0]).toEqual(['General'])
  })

  it('switches enabled tabs and blocks disabled tabs', async () => {
    const wrapper = mountTabs()
    const tabItems = wrapper.findAll('.tx-tab-item')

    expect(tabItems).toHaveLength(3)
    expect(tabItems.map(item => item.element.tagName)).toEqual(['BUTTON', 'BUTTON', 'BUTTON'])
    expect(tabItems[0].attributes('type')).toBe('button')
    // Tab items now expose tab semantics (pre-fix `role` was undefined).
    expect(tabItems[0].attributes('role')).toBe('tab')
    expect(tabItems[0].attributes('aria-selected')).toBe('true')
    expect(tabItems[1].attributes('aria-selected')).toBe('false')
    expect(tabItems[2].attributes('disabled')).toBeDefined()

    await wrapper.findAllComponents(TxTabItem)[1].trigger('click')
    await nextTick()

    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['Network'])
    expect(wrapper.emitted('change')?.at(-1)).toEqual(['Network'])
    expect(wrapper.classes()).toContain('tx-tabs--indicator-visible')
    expect(wrapper.classes()).not.toContain('tx-tabs--indicator-pending')
    expect(wrapper.text()).toContain('Network content')

    await wrapper.findAllComponents(TxTabItem)[2].trigger('click')
    await nextTick()

    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['Network'])
    expect(wrapper.text()).not.toContain('Disabled content')
  })

  it('exposes tablist and tabpanel semantics on the nav row and active panel', async () => {
    const wrapper = mountTabs()
    await nextTick()

    const tablist = wrapper.find('.tx-tabs__nav-inner')
    // Pre-fix the nav row and the active panel carried no ARIA roles at all.
    expect(tablist.attributes('role')).toBe('tablist')
    expect(['horizontal', 'vertical']).toContain(tablist.attributes('aria-orientation'))
    expect(wrapper.find('.tx-tabs__select-slot').attributes('role')).toBe('tabpanel')
  })

  it('uses controlled modelValue without emitting on prop-driven updates', async () => {
    const wrapper = mountTabs({
      modelValue: 'Network',
    })

    await nextTick()

    expect(wrapper.find('.active-header').text()).toBe('Network')
    expect(wrapper.text()).toContain('Network content')
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()

    await wrapper.setProps({ modelValue: 'General' })
    await nextTick()

    expect(wrapper.find('.active-header').text()).toBe('General')
    expect(wrapper.text()).toContain('General content')
    expect(wrapper.emitted('change')).toBeUndefined()
    expect(wrapper.classes()).toContain('tx-tabs--indicator-pending')
    expect(wrapper.classes()).not.toContain('tx-tabs--indicator-visible')
  })

  it('renders tab items generated inside fragments', async () => {
    const tabs = [
      { name: 'Overview', content: 'Overview content' },
      { name: 'Details', content: 'Details content' },
    ]

    const wrapper = mount(TxTabs, {
      props: {
        modelValue: 'Details',
      },
      global: {
        stubs: {
          TxAutoSizer: AutoSizerStub,
        },
      },
      slots: {
        default: () => [
          h(Fragment, null, tabs.map(tab => h(TxTabItem, { key: tab.name, name: tab.name }, {
            default: () => tab.content,
          }))),
        ],
      },
    })

    await nextTick()

    expect(wrapper.text()).toContain('Details content')
    expect(wrapper.text()).not.toContain('No tab selected')
    expect(wrapper.findAllComponents(TxTabItem)).toHaveLength(2)
  })

  it('renders tab items wrapped by named async components', async () => {
    const AsyncTabItem = defineAsyncComponent(async () => TxTabItem)
    Object.defineProperty(AsyncTabItem, 'name', {
      value: 'TxTabItem',
      configurable: true,
    })

    const wrapper = mount(TxTabs, {
      props: {
        modelValue: 'Account',
      },
      global: {
        stubs: {
          TxAutoSizer: AutoSizerStub,
        },
      },
      slots: {
        default: () => [
          h(AsyncTabItem, { name: 'General', iconClass: 'i-general' }, {
            default: () => 'General content',
          }),
          h(AsyncTabItem, { name: 'Account', iconClass: 'i-account' }, {
            default: () => 'Account content',
          }),
        ],
      },
    })

    await flushPromises()
    await nextTick()

    expect(wrapper.text()).toContain('Account content')
    expect(wrapper.text()).not.toContain('No tab selected')
    expect(wrapper.findAllComponents(TxTabItem)).toHaveLength(2)
  })

  it('renders grouped tab items generated inside fragments', async () => {
    const tabs = [
      { name: 'Network', content: 'Network content' },
      { name: 'Storage', content: 'Storage content' },
    ]

    const wrapper = mount(TxTabs, {
      props: {
        defaultValue: 'Storage',
      },
      global: {
        stubs: {
          TxAutoSizer: AutoSizerStub,
        },
      },
      slots: {
        default: () => [
          h(TxTabItemGroup, { name: 'Advanced' }, {
            default: () => [
              h(Fragment, null, tabs.map(tab => h(TxTabItem, { key: tab.name, name: tab.name }, {
                default: () => tab.content,
              }))),
            ],
          }),
        ],
      },
    })

    await nextTick()

    expect(wrapper.text()).toContain('Advanced')
    expect(wrapper.text()).toContain('Storage content')
    expect(wrapper.text()).not.toContain('No tab selected')
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['Storage'])
  })

  it('supports content animation variants and hidden indicator', async () => {
    const wrapper = mountTabs({
      showIndicator: false,
      animation: {
        indicator: { durationMs: 400 },
        content: { type: 'slide', durationRatio: 0.5, easing: 'linear' },
      },
    })

    await nextTick()

    expect(wrapper.classes()).toContain('tx-tabs--indicator-hidden')
    expect(wrapper.classes()).not.toContain('tx-tabs--indicator-anim')
    expect(wrapper.classes()).toContain('tx-tabs--content-slide')
    expect(wrapper.attributes('style')).toContain('--tx-tabs-content-duration: 200ms')
    expect(wrapper.attributes('style')).toContain('--tx-tabs-content-easing: linear')
    expect(wrapper.find('.tx-tabs__pointer').exists()).toBe(false)
  })

  it('normalizes invalid visual props and exposes AutoSizer methods', async () => {
    const wrapper = mountTabs({
      placement: 'diagonal',
      indicatorVariant: 'unknown',
      indicatorMotion: 'jump',
      autoWidth: true,
      contentScrollable: false,
      animation: {
        size: { durationMs: 420, easing: 'linear' },
        nav: false,
        indicator: false,
        content: false,
      },
    })

    await nextTick()

    expect(wrapper.classes()).toContain('tx-tabs--left')
    expect(wrapper.classes()).toContain('tx-tabs--indicator-line')
    expect(wrapper.classes()).toContain('tx-tabs--motion-stretch')
    expect(wrapper.classes()).toContain('tx-tabs--auto-width')
    expect(wrapper.classes()).not.toContain('tx-tabs--indicator-anim')
    expect(wrapper.classes()).not.toContain('tx-tabs--nav-anim')
    expect(wrapper.classes()).not.toContain('tx-tabs--content-anim')
    expect(wrapper.classes()).toContain('tx-tabs--content-none')
    expect(wrapper.find('.tx-tabs__content-scroll').exists()).toBe(false)

    const autoSizer = wrapper.findComponent(AutoSizerStub)
    expect(autoSizer.props('width')).toBe(true)
    expect(autoSizer.props('height')).toBe(true)
    expect(autoSizer.props('durationMs')).toBe(420)
    expect(autoSizer.props('easing')).toBe('linear')
    expect(autoSizer.props('observeTarget')).toBe('both')

    await expect(wrapper.vm.flip(() => undefined)).resolves.toBeUndefined()
    await expect(wrapper.vm.action(() => undefined)).resolves.toEqual({ changedKeys: [] })
    expect(wrapper.vm.size()).toEqual({ width: 320, height: 180 })
  })

  it('exposes AutoSizer size as the unwrapped ref value (issue #460 regression)', async () => {
    const wrapper = mountTabs()

    await nextTick()

    // The real TxAutoSizer exposes `size` as a Ref; Vue's expose proxy unwraps it
    // via proxyRefs, so reading `.value` again (the original bug) returned undefined.
    // size() must return the plain object the ref holds, not the ref and not undefined.
    const size = wrapper.vm.size()
    expect(size).not.toBeUndefined()
    expect(size).toEqual({ width: 320, height: 180 })
  })

  it('keeps the tablist to one tab stop and links each tab to its panel', async () => {
    const wrapper = mountTabs()
    await nextTick()

    const tabItems = wrapper.findAll('.tx-tab-item')
    // ARIA tablist: exactly one tab stop, on the selected tab.
    expect(tabItems.map(item => item.attributes('tabindex'))).toEqual(['0', '-1', '-1'])

    const panel = wrapper.find('[role="tabpanel"]')
    const activeTab = tabItems[0]
    expect(activeTab.attributes('aria-controls')).toBe(panel.attributes('id'))
    expect(panel.attributes('aria-labelledby')).toBe(activeTab.attributes('id'))
    expect(activeTab.attributes('id')).toBeTruthy()
  })

  it('moves between tabs with arrow keys', async () => {
    // A horizontal tablist: placement defaults to 'left', where the pattern
    // correctly uses Up/Down instead.
    const wrapper = mountTabs({ placement: 'top' })
    await nextTick()

    const tablist = wrapper.find('[role="tablist"]')
    expect(tablist.attributes('aria-orientation')).toBe('horizontal')

    await tablist.trigger('keydown', { key: 'ArrowRight' })
    await nextTick()
    expect(wrapper.findAll('.tx-tab-item')[1].attributes('aria-selected')).toBe('true')

    await tablist.trigger('keydown', { key: 'ArrowLeft' })
    await nextTick()
    expect(wrapper.findAll('.tx-tab-item')[0].attributes('aria-selected')).toBe('true')

    await tablist.trigger('keydown', { key: 'End' })
    await nextTick()
    // The fixture's last tab is disabled, so End lands on the last *enabled*
    // tab — disabled tabs are not navigation targets.
    const items = wrapper.findAll('.tx-tab-item')
    expect(items[1].attributes('aria-selected')).toBe('true')
    expect(items[2].attributes('aria-selected')).toBe('false')

    await tablist.trigger('keydown', { key: 'Home' })
    await nextTick()
    expect(wrapper.findAll('.tx-tab-item')[0].attributes('aria-selected')).toBe('true')
  })

  it('uses up/down on a vertical tablist', async () => {
    const wrapper = mountTabs({ placement: 'left' })
    await nextTick()

    const tablist = wrapper.find('[role="tablist"]')
    expect(tablist.attributes('aria-orientation')).toBe('vertical')

    await tablist.trigger('keydown', { key: 'ArrowDown' })
    await nextTick()
    expect(wrapper.findAll('.tx-tab-item')[1].attributes('aria-selected')).toBe('true')

    // The cross-axis key is not the navigation key for this orientation.
    await tablist.trigger('keydown', { key: 'ArrowRight' })
    await nextTick()
    expect(wrapper.findAll('.tx-tab-item')[1].attributes('aria-selected')).toBe('true')
  })
})
