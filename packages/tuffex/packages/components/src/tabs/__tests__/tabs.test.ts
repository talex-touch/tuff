import { mount } from '@vue/test-utils'
import { defineComponent, h, nextTick } from 'vue'
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
  },
  setup(_props, { expose, slots }) {
    expose({
      refresh: () => undefined,
      flip: async (action: () => void | Promise<void>) => action(),
      action: async (fn: (el?: HTMLElement) => void | Promise<void>) => {
        await fn(undefined)
        return { changedKeys: [] }
      },
      size: { value: { width: 320, height: 180 } },
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
          default: () => 'General content',
        }),
        h(TxTabItemGroup, { name: 'Advanced' }, {
          default: () => [
            h(TxTabItem, { name: 'Network', iconClass: 'i-network' }, {
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
    expect(wrapper.attributes('style')).toContain('--tx-tabs-indicator-strength: 0')
    expect(wrapper.find('.tx-tabs__group-name').text()).toBe('Advanced')
    expect(wrapper.find('.nav-action').exists()).toBe(true)
    expect(wrapper.find('.active-header').text()).toBe('General')
    expect(wrapper.find('.tx-tabs__content-scroll').exists()).toBe(true)
    expect(wrapper.text()).toContain('General content')
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['General'])
    expect(wrapper.emitted('change')?.[0]).toEqual(['General'])
  })

  it('switches enabled tabs and blocks disabled tabs', async () => {
    const wrapper = mountTabs()

    await wrapper.findAllComponents(TxTabItem)[1].trigger('click')
    await nextTick()

    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['Network'])
    expect(wrapper.emitted('change')?.at(-1)).toEqual(['Network'])
    expect(wrapper.text()).toContain('Network content')

    await wrapper.findAllComponents(TxTabItem)[2].trigger('click')
    await nextTick()

    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['Network'])
    expect(wrapper.text()).not.toContain('Disabled content')
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
    expect(wrapper.find('.tx-tabs__content-scroll').exists()).toBe(false)

    const autoSizer = wrapper.findComponent(AutoSizerStub)
    expect(autoSizer.props('width')).toBe(true)
    expect(autoSizer.props('height')).toBe(true)
    expect(autoSizer.props('durationMs')).toBe(420)
    expect(autoSizer.props('easing')).toBe('linear')

    await expect(wrapper.vm.flip(() => undefined)).resolves.toBeUndefined()
    await expect(wrapper.vm.action(() => undefined)).resolves.toEqual({ changedKeys: [] })
    expect(wrapper.vm.size()).toEqual({ width: 320, height: 180 })
  })
})
