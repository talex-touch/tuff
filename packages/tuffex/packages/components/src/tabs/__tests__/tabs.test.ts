import { flushPromises, mount } from '@vue/test-utils'
import * as sass from 'sass'
import { Fragment, defineAsyncComponent, defineComponent, h, nextTick, ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import TxTabHeader from '../src/TxTabHeader.vue'
import TxTabItem from '../src/TxTabItem.vue'
import TxTabItemGroup from '../src/TxTabItemGroup.vue'
import TxTabItemSource from '../src/TxTabItem.vue?raw'
import TxTabs from '../src/TxTabs.vue'
import TxTabsSource from '../src/TxTabs.vue?raw'

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

/**
 * TxAutoSizer's real `flip` (useFlip) awaits the action, a tick and then a
 * frame before it measures, so with a size animation on, a switch stays
 * pending across frames — the window in which the new panel's layout refresh
 * runs. The plain stub above resolves in the same tick and hides that window.
 */
const FrameFlipAutoSizerStub = defineComponent({
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
      flip: async (action: () => void | Promise<void>) => {
        await action()
        await nextTick()
        await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
      },
      action: async (fn: (el?: HTMLElement) => void | Promise<void>) => {
        await fn(undefined)
        return { changedKeys: [] }
      },
      size: ref({ width: 320, height: 180 }),
    })
    return () => h('div', { class: 'auto-sizer-stub' }, slots.default?.())
  },
})

function mountTabs(props: Record<string, unknown> = {}, autoSizer: ReturnType<typeof defineComponent> = AutoSizerStub) {
  return mount(TxTabs, {
    props,
    global: {
      stubs: {
        TxAutoSizer: autoSizer,
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

  it('moves focus without depending on the CSS global', async () => {
    // jsdom (and SSR) has no `CSS`, so building a `#id` selector via CSS.escape
    // rejected inside the nextTick callback. Every assertion still passed, so the
    // only symptom was vitest exiting non-zero on an unhandled rejection — assert
    // on the rejection itself, not on the visible outcome.
    const originalCss = (globalThis as any).CSS
    delete (globalThis as any).CSS

    const rejections: unknown[] = []
    const onUnhandled = (reason: unknown) => rejections.push(reason)
    process.on('unhandledRejection', onUnhandled)

    try {
      const wrapper = mountTabs({ placement: 'top' })
      await nextTick()

      const tablist = wrapper.find('[role="tablist"]')
      await tablist.trigger('keydown', { key: 'ArrowRight' })
      await nextTick()
      await nextTick()
      await new Promise(resolve => setTimeout(resolve, 0))

      expect(rejections).toEqual([])
      expect(wrapper.findAll('.tx-tab-item')[1].attributes('aria-selected')).toBe('true')
    }
    finally {
      process.off('unhandledRejection', onUnhandled)
      if (originalCss !== undefined)
        (globalThis as any).CSS = originalCss
    }
  })

  // The indicator used to be revealed only from a tab's own click handler:
  // `applyPointerFor({ reveal: true })` is called from `onClick` and nowhere
  // else, while every mount and layout path passes `reveal: false`. A freshly
  // mounted TxTabs therefore painted its pointer at opacity 0 and left it there,
  // so tabs whose active item comes from `v-model` or `activation` showed no
  // indicator at all until something was clicked.
  it('reveals the indicator on first layout, without waiting for a click', async () => {
    // jsdom reports every rect as 0x0, and the reveal is guarded on a non-zero
    // measurement so it cannot fire before layout exists. Give it a real size.
    const proto = Element.prototype as unknown as { getBoundingClientRect: () => DOMRect }
    const original = proto.getBoundingClientRect
    proto.getBoundingClientRect = function (): DOMRect {
      return { x: 0, y: 0, top: 0, left: 0, right: 80, bottom: 32, width: 80, height: 32, toJSON: () => ({}) } as DOMRect
    }

    try {
      const wrapper = mountTabs()
      await nextTick()
      await flushPromises()
      await nextTick()

      const pointer = wrapper.find('.tx-tabs__pointer')
      expect(pointer.exists()).toBe(true)
      expect((pointer.element as HTMLElement).style.opacity).toBe('1')
      expect(wrapper.find('.tx-tabs').classes()).not.toContain('tx-tabs--indicator-pending')
    }
    finally {
      proto.getBoundingClientRect = original
    }
  })

  it('keeps the indicator hidden while nothing has been laid out yet', async () => {
    // Default jsdom: every rect is 0x0, so the guard must hold the pointer back
    // rather than parking it at the nav's origin.
    const wrapper = mountTabs()
    await nextTick()
    await flushPromises()

    expect((wrapper.find('.tx-tabs__pointer').element as HTMLElement).style.opacity).toBe('0')
  })
})

/**
 * The pointer rides the shared indicator engine (`useJellyIndicator`) on the
 * glide material: measured here; moved there, its two ends on springs so it
 * lengthens a little and gathers again, never scaling; written onto
 * `.tx-tabs__pointer` per frame.
 * jsdom lays nothing out, so the layout is stubbed from `layout`: the
 * nav-inner at the origin and, by default, a row of tab items 100px apart.
 * `layout.scale` stands in for an ancestor transform — rects come back scaled,
 * the nav's layout sizes do not.
 */
describe('txTabs pointer on the glide material', () => {
  const proto = Element.prototype as unknown as { getBoundingClientRect: () => DOMRect }
  let originalRect: () => DOMRect
  let restoreGetters: Array<() => void> = []

  type Box = [left: number, top: number, width: number, height: number]
  const ROW = { nav: { width: 400, height: 44 }, item: (index: number): Box => [10 + index * 100, 6, 80, 32] }
  const COLUMN = { nav: { width: 200, height: 300 }, item: (index: number): Box => [14, 8 + index * 40, 172, 34] }
  const layout = { ...ROW, scale: 1 }

  function rect(left: number, top: number, width: number, height: number): DOMRect {
    return { x: left, y: top, left, top, right: left + width, bottom: top + height, width, height, toJSON: () => ({}) } as DOMRect
  }

  function stubGetter(target: object, key: string, get: (this: HTMLElement) => number) {
    const own = Object.getOwnPropertyDescriptor(target, key)
    Object.defineProperty(target, key, { configurable: true, get })
    restoreGetters.push(() => {
      if (own)
        Object.defineProperty(target, key, own)
      else
        delete (target as Record<string, unknown>)[key]
    })
  }

  beforeEach(() => {
    Object.assign(layout, ROW, { scale: 1 })
    vi.useFakeTimers({
      toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance'],
    })
    // The item's real padding (TxTabItem: 8px 10px) and radius; jsdom's own UA
    // sheet gives buttons 6px and only once they are attached, so it is pinned.
    const computed = window.getComputedStyle.bind(window)
    vi.stubGlobal('getComputedStyle', (el: Element, pseudo?: string | null) => {
      const style = computed(el, pseudo)
      if (!el.classList.contains('tx-tab-item'))
        return style
      const pinned: Record<string, string> = { paddingLeft: '10px', paddingRight: '10px', paddingTop: '8px', paddingBottom: '8px', borderRadius: '10px' }
      return new Proxy(style, {
        get: (target, key) => (typeof key === 'string' && key in pinned ? pinned[key] : Reflect.get(target, key)),
      })
    })
    originalRect = proto.getBoundingClientRect
    proto.getBoundingClientRect = function (this: Element): DOMRect {
      const s = layout.scale
      if (this.classList.contains('tx-tab-item')) {
        const items = Array.from(this.closest('.tx-tabs__nav-inner')?.querySelectorAll('.tx-tab-item') ?? [])
        const [left, top, width, height] = layout.item(items.indexOf(this))
        return rect(left * s, top * s, width * s, height * s)
      }
      if (this.classList.contains('tx-tabs__nav-inner'))
        return rect(0, 0, layout.nav.width * s, layout.nav.height * s)
      return rect(0, 0, 80, 32)
    }
    // Layout sizes are the nav's own pixels, unaffected by `layout.scale`.
    const navSize = (el: HTMLElement, key: 'width' | 'height') => (el.classList.contains('tx-tabs__nav-inner') ? layout.nav[key] : 0)
    stubGetter(HTMLElement.prototype, 'clientWidth', function () { return navSize(this, 'width') })
    stubGetter(HTMLElement.prototype, 'clientHeight', function () { return navSize(this, 'height') })
    stubGetter(HTMLElement.prototype, 'offsetWidth', function () { return navSize(this, 'width') })
    stubGetter(HTMLElement.prototype, 'scrollWidth', function () { return navSize(this, 'width') })
    stubGetter(HTMLElement.prototype, 'scrollHeight', function () { return navSize(this, 'height') })
  })

  afterEach(() => {
    proto.getBoundingClientRect = originalRect
    for (const restore of restoreGetters.reverse())
      restore()
    restoreGetters = []
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  async function settle() {
    await flushPromises()
    await nextTick()
  }

  function pointerStyle(wrapper: ReturnType<typeof mountTabs>) {
    return (wrapper.find('.tx-tabs__pointer').element as HTMLElement).style
  }

  function readPointer(wrapper: ReturnType<typeof mountTabs>) {
    const style = pointerStyle(wrapper)
    const [, x, y, sx, sy] = /translate3d\(([-+\d.e]+)px, ([-+\d.e]+)px, 0\) scale\(([\d.]+), ([\d.]+)\)/.exec(style.transform) ?? []
    return {
      transform: style.transform,
      x: Number(x),
      y: Number(y),
      scaleX: Number(sx),
      scaleY: Number(sy),
      width: Number.parseFloat(style.width),
      height: Number.parseFloat(style.height),
    }
  }

  it('lands the first measurement in place instead of sliding in from the nav edge', async () => {
    const wrapper = mountTabs({ placement: 'top' })
    await settle()

    const style = pointerStyle(wrapper)
    expect(style.opacity).toBe('1')
    // Under the label: inset by the item's padding, resting on the divider
    // (the 44px tablist's bottom edge, less the 2px line).
    expect(style.transform).toBe('translate3d(20px, 42px, 0) scale(1.000, 1.000)')
    expect(style.width).toBe('60px')
    expect(style.height).toBe('2px')

    wrapper.unmount()
  })

  it('glides to a clicked tab, lengthening on the way without scaling, and settles exactly on it', async () => {
    const wrapper = mountTabs({ placement: 'top' })
    await settle()

    await wrapper.findAll('.tx-tab-item')[1]!.trigger('click')
    await settle()

    let midFlight = false
    let longest = 0
    for (let frame = 0; frame < 200; frame++) {
      vi.advanceTimersByTime(16)
      const { x, width, scaleX, scaleY } = readPointer(wrapper)
      // Only the box moves and resizes: never a squash, a stretch or a pop.
      expect([scaleX, scaleY]).toEqual([1, 1])
      if (x > 20 && x < 120)
        midFlight = true
      longest = Math.max(longest, width)
    }

    // The 60px line runs longer than it leaves or lands (about 74px): its
    // leading end outruns the trailing one, which then catches up.
    expect(midFlight).toBe(true)
    expect(longest).toBeGreaterThan(60 + 5)
    expect(pointerStyle(wrapper).transform).toBe('translate3d(120px, 42px, 0) scale(1.000, 1.000)')
    expect(pointerStyle(wrapper).width).toBe('60px')

    wrapper.unmount()
  })

  // Regression: with a size animation `runAutoHeight` resolves frames after
  // the click, and the layout refresh the new panel schedules inside those
  // frames reached the engine first with `animate: false` — which lands. The
  // click's own `animate: true` then found the pointer already there, so tabs
  // with `autoHeight` / `autoWidth` / `animation.size` jumped instead of
  // travelling (the NavigationShell demo, for one).
  it('travels on a click while a size animation holds the switch across frames', async () => {
    const wrapper = mountTabs({ placement: 'top', autoHeight: true }, FrameFlipAutoSizerStub)
    await settle()
    await vi.advanceTimersByTimeAsync(100)
    expect(pointerStyle(wrapper).transform).toBe('translate3d(20px, 42px, 0) scale(1.000, 1.000)')

    await wrapper.findAll('.tx-tab-item')[1]!.trigger('click')
    await vi.advanceTimersByTimeAsync(64)

    const flying = pointerStyle(wrapper).transform
    const x = Number(/translate3d\(([-\d.]+)px/.exec(flying)?.[1])
    expect(x).toBeGreaterThan(20)
    expect(x).toBeLessThan(120)

    await vi.advanceTimersByTimeAsync(3000)
    expect(pointerStyle(wrapper).transform).toBe('translate3d(120px, 42px, 0) scale(1.000, 1.000)')

    wrapper.unmount()
  })

  it('travels when the parent changes modelValue while a size animation runs', async () => {
    const wrapper = mountTabs({ placement: 'top', autoHeight: true, modelValue: 'General' }, FrameFlipAutoSizerStub)
    await settle()
    await vi.advanceTimersByTimeAsync(100)

    await wrapper.setProps({ modelValue: 'Network' })
    await vi.advanceTimersByTimeAsync(64)

    const x = Number(/translate3d\(([-\d.]+)px/.exec(pointerStyle(wrapper).transform)?.[1])
    expect(x).toBeGreaterThan(20)
    expect(x).toBeLessThan(120)

    wrapper.unmount()
  })

  it('moves the pointer when the arrow keys change the tab', async () => {
    const wrapper = mountTabs({ placement: 'top' })
    await settle()

    await wrapper.find('[role="tablist"]').trigger('keydown', { key: 'ArrowRight' })
    await settle()
    vi.advanceTimersByTime(3000)

    expect(wrapper.findAll('.tx-tab-item')[1]!.attributes('aria-selected')).toBe('true')
    expect(pointerStyle(wrapper).transform).toBe('translate3d(120px, 42px, 0) scale(1.000, 1.000)')

    wrapper.unmount()
  })

  it('jumps without travelling or deforming under prefers-reduced-motion', async () => {
    const original = window.matchMedia
    window.matchMedia = ((query: string) => ({
      matches: query.includes('reduce'),
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })) as typeof window.matchMedia

    try {
      const wrapper = mountTabs({ placement: 'top' })
      await settle()

      await wrapper.findAll('.tx-tab-item')[1]!.trigger('click')
      await settle()

      expect(pointerStyle(wrapper).transform).toBe('translate3d(120px, 42px, 0) scale(1.000, 1.000)')
      wrapper.unmount()
    }
    finally {
      window.matchMedia = original
    }
  })

  it('covers the whole item for the box variants', async () => {
    const wrapper = mountTabs({ placement: 'top', indicatorVariant: 'pill' })
    await settle()

    const style = pointerStyle(wrapper)
    expect(style.transform).toBe('translate3d(10px, 6px, 0) scale(1.000, 1.000)')
    expect(style.width).toBe('80px')
    expect(style.height).toBe('32px')
    // The item's own corners, so a host that restyles them keeps a matching pill.
    expect(style.borderRadius).toBe('10px')

    wrapper.unmount()
  })

  // Where each variant rests, for every placement: the line on the divider
  // (top / bottom) or the nav's outer edge (left / right), the dot 4px in from
  // that same edge, the box variants over the whole item.
  it.each([
    ['top', 'line', 'translate3d(20px, 42px, 0)', '60px', '2px'],
    ['bottom', 'line', 'translate3d(20px, 0px, 0)', '60px', '2px'],
    ['left', 'line', 'translate3d(0px, 16px, 0)', '2px', '18px'],
    ['right', 'line', 'translate3d(198px, 16px, 0)', '2px', '18px'],
    ['top', 'dot', 'translate3d(47px, 34px, 0)', '6px', '6px'],
    ['bottom', 'dot', 'translate3d(47px, 4px, 0)', '6px', '6px'],
    ['left', 'dot', 'translate3d(4px, 22px, 0)', '6px', '6px'],
    ['right', 'dot', 'translate3d(190px, 22px, 0)', '6px', '6px'],
    ['top', 'block', 'translate3d(10px, 6px, 0)', '80px', '32px'],
    ['left', 'outline', 'translate3d(14px, 8px, 0)', '172px', '34px'],
  ] as const)('rests a %s %s where it belongs', async (placement, variant, translate, width, height) => {
    if (placement === 'left' || placement === 'right')
      Object.assign(layout, COLUMN)
    const wrapper = mountTabs({ placement, indicatorVariant: variant })
    await settle()

    const style = pointerStyle(wrapper)
    expect(style.transform).toBe(`${translate} scale(1.000, 1.000)`)
    expect(style.width).toBe(width)
    expect(style.height).toBe(height)

    wrapper.unmount()
  })

  it('gives a short label a line long enough to read, centred under it', async () => {
    layout.item = (index: number): Box => [10 + index * 100, 6, 26, 32]
    const wrapper = mountTabs({ placement: 'top' })
    await settle()

    // 6px of label between 10px paddings: the 16px minimum, centred on the label.
    const style = pointerStyle(wrapper)
    expect(style.width).toBe('16px')
    expect(style.transform).toBe('translate3d(15px, 42px, 0) scale(1.000, 1.000)')

    wrapper.unmount()
  })

  it('shifts the line along the tab axis by offset', async () => {
    const wrapper = mountTabs({ placement: 'top', offset: 5 })
    await settle()

    expect(pointerStyle(wrapper).transform).toBe('translate3d(25px, 42px, 0) scale(1.000, 1.000)')

    wrapper.unmount()
  })

  it('places the pointer in the nav\'s own pixels under an ancestor transform', async () => {
    layout.scale = 2
    const wrapper = mountTabs({ placement: 'top' })
    await settle()

    // Every rect comes back doubled; the translate must not.
    const style = pointerStyle(wrapper)
    expect(style.transform).toBe('translate3d(20px, 42px, 0) scale(1.000, 1.000)')
    expect(style.width).toBe('60px')

    wrapper.unmount()
  })

  it('reshapes on the way when the variant changes', async () => {
    const wrapper = mountTabs({ placement: 'top', indicatorVariant: 'pill' })
    await settle()

    await wrapper.setProps({ indicatorVariant: 'line' })
    await settle()
    vi.advanceTimersByTime(48)

    // Between the pill's 32px and the line's 2px: travelling, not jumping.
    const height = Number.parseFloat(pointerStyle(wrapper).height)
    expect(height).toBeGreaterThan(2)
    expect(height).toBeLessThan(32)

    vi.advanceTimersByTime(3000)
    const style = pointerStyle(wrapper)
    expect(style.transform).toBe('translate3d(20px, 42px, 0) scale(1.000, 1.000)')
    expect(style.height).toBe('2px')
    // The pill's measured corners give way to the line's stylesheet radius.
    expect(style.borderRadius).toBe('')

    wrapper.unmount()
  })

  it('marks the pointer as moving only while it travels', async () => {
    const wrapper = mountTabs({ placement: 'top' })
    await settle()
    const inner = wrapper.find('.tx-tabs__pointer-inner')
    expect(inner.classes()).not.toContain('is-moving')

    await wrapper.findAll('.tx-tab-item')[1]!.trigger('click')
    await settle()
    vi.advanceTimersByTime(64)
    expect(inner.classes()).toContain('is-moving')

    vi.advanceTimersByTime(3000)
    expect(inner.classes()).not.toContain('is-moving')

    wrapper.unmount()
  })

  it('lands a switch in place when animation.indicator is off', async () => {
    const wrapper = mountTabs({ placement: 'top', animation: { indicator: false } })
    await settle()

    await wrapper.findAll('.tx-tab-item')[1]!.trigger('click')
    await settle()

    expect(pointerStyle(wrapper).transform).toBe('translate3d(120px, 42px, 0) scale(1.000, 1.000)')

    wrapper.unmount()
  })

  // Regression: hiding the pointer mid-trip used to leave the engine looping
  // for an element that was gone, and showing it again resumed that trip.
  it('stops the pointer\'s work when hidden and lands in place when shown again', async () => {
    const wrapper = mountTabs({ placement: 'top' })
    await settle()

    await wrapper.findAll('.tx-tab-item')[1]!.trigger('click')
    await settle()
    vi.advanceTimersByTime(48)

    await wrapper.setProps({ showIndicator: false })
    await settle()
    await wrapper.setProps({ showIndicator: true })
    await settle()
    // The layout refresh that measures the new pointer runs on the next frame.
    await vi.advanceTimersByTimeAsync(20)

    expect(pointerStyle(wrapper).transform).toBe('translate3d(120px, 42px, 0) scale(1.000, 1.000)')

    wrapper.unmount()
  })

  // Regression: the tablist clips its overflow. A host with a tight gutter
  // (TemplateStoreDemo pads the tablist `4px 0`) puts the first pill 8px from
  // the edge, and the `spring` motion's leading end overshoots its target by
  // about 9px — free, it reaches 1px past the edge and is cut off flat. The
  // walls stop each end at the tablist's extent; the glide never scales, so
  // the painted box is exactly the written one.
  it('keeps the spring\'s overshoot inside the clipping tablist', async () => {
    layout.nav = { width: 400, height: 56 }
    layout.item = (index: number): Box => [8 + index * 96, 12, 80, 32]
    const wrapper = mountTabs({ placement: 'top', indicatorVariant: 'pill', indicatorMotion: 'spring' })
    await settle()

    let minLeft = Number.POSITIVE_INFINITY
    let maxRight = Number.NEGATIVE_INFINITY
    for (const index of [1, 0, 1, 0]) {
      await wrapper.findAll('.tx-tab-item')[index]!.trigger('click')
      await settle()
      for (let frame = 0; frame < 150; frame++) {
        vi.advanceTimersByTime(16)
        const { x, width, scaleX, scaleY } = readPointer(wrapper)
        expect([scaleX, scaleY]).toEqual([1, 1])
        minLeft = Math.min(minLeft, x)
        maxRight = Math.max(maxRight, x + width)
      }
    }

    // Exactly on the edge: the wall stopped the leading end there.
    expect(minLeft).toBe(0)
    expect(maxRight).toBeLessThanOrEqual(400)
    // The wall stops the overshoot, never the target: it still lands on the tab.
    expect(pointerStyle(wrapper).transform).toBe('translate3d(8px, 12px, 0) scale(1.000, 1.000)')

    wrapper.unmount()
  })

  /** Click from the first tab to the second and sample every frame until it rests. */
  async function trip(props: Record<string, unknown> = {}) {
    const wrapper = mountTabs({ placement: 'top', ...props })
    await settle()
    await wrapper.findAll('.tx-tab-item')[1]!.trigger('click')
    await settle()

    let longest = 0
    let shortest = Number.POSITIVE_INFINITY
    let overshoot = 0
    let overshoots = 0
    let past = false
    let travelled = false
    let scaled = false
    let settledAt = Number.POSITIVE_INFINITY
    for (let frame = 1; frame <= 400; frame++) {
      vi.advanceTimersByTime(16)
      const { transform, x, width, scaleX, scaleY } = readPointer(wrapper)
      // The leading end: the right one, heading for 180.
      const lead = x + width
      longest = Math.max(longest, width)
      shortest = Math.min(shortest, width)
      overshoot = Math.max(overshoot, lead - 180)
      // Each visible excursion past the target counts once.
      if (!past && lead > 180 + 0.5) {
        overshoots++
        past = true
      }
      else if (past && lead < 180) {
        past = false
      }
      if (x > 20 && x < 120)
        travelled = true
      if (scaleX !== 1 || scaleY !== 1)
        scaled = true
      if (transform === 'translate3d(120px, 42px, 0) scale(1.000, 1.000)' && width === 60) {
        settledAt = frame * 16
        break
      }
    }
    wrapper.unmount()
    return { longest, shortest, overshoot, overshoots, travelled, scaled, settledAt }
  }

  // `indicatorMotion` names a variation of the glide (`MOTION_GLIDE`); these
  // are the differences the API table promises for each name.
  it('maps each indicatorMotion onto a distinct variation of the glide', async () => {
    const stretch = await trip()
    const spring = await trip({ indicatorMotion: 'spring' })
    const warp = await trip({ indicatorMotion: 'warp' })
    const glide = await trip({ indicatorMotion: 'glide' })
    const snap = await trip({ indicatorMotion: 'snap' })

    for (const run of [stretch, spring, warp, glide, snap]) {
      expect(run.travelled).toBe(true)
      expect(run.scaled).toBe(false)
      expect(run.settledAt).toBeLessThan(Number.POSITIVE_INFINITY)
    }
    // `glide`: both ends on one spring, a rigid slide that never lengthens.
    expect(glide.longest).toBeCloseTo(60, 6)
    expect(glide.shortest).toBeCloseTo(60, 6)
    // `stretch` lengthens (about 74px), `warp` further (about 84px).
    expect(stretch.longest).toBeGreaterThan(60 + 5)
    expect(warp.longest).toBeGreaterThan(stretch.longest + 5)
    // `spring` passes the tab once (by about 9px) and comes back; the others
    // arrive without passing it.
    expect(spring.overshoot).toBeGreaterThan(5)
    expect(spring.overshoots).toBe(1)
    for (const run of [stretch, warp, glide, snap]) {
      expect(run.overshoot).toBeLessThan(0.5)
      expect(run.overshoots).toBe(0)
    }
    // `snap` rests first.
    for (const run of [stretch, spring, warp, glide])
      expect(snap.settledAt).toBeLessThan(run.settledAt)
  })

  it('time-scales the glide with animation.indicator.durationMs', async () => {
    const reference = await trip()
    const slow = await trip({ animation: { indicator: { durationMs: 700 } } })
    const fast = await trip({ animation: { indicator: { durationMs: 175 } } })

    // Half (double) the natural frequency at the same damping ratio: about
    // twice (half) as long. Not exact — the settle thresholds are absolute px
    // and px/s.
    expect(slow.settledAt).toBeGreaterThan(reference.settledAt * 1.6)
    expect(fast.settledAt).toBeLessThan(reference.settledAt * 0.7)
    // The same glide on another clock: how far it lengthens does not change.
    expect(Math.abs(slow.longest - reference.longest)).toBeLessThan(1)
    expect(Math.abs(fast.longest - reference.longest)).toBeLessThan(1)
  })

  it('scales the lengthening with indicatorMotionStrength, and slides rigidly at 0', async () => {
    const reference = await trip()
    const rigid = await trip({ indicatorMotionStrength: 0 })
    const strong = await trip({ indicatorMotionStrength: 1.5 })

    // The strength multiplies the lag, so 0 puts both ends on one spring: the
    // pointer travels the whole way at its own 60px.
    expect(rigid.travelled).toBe(true)
    expect(rigid.scaled).toBe(false)
    expect(rigid.longest).toBeCloseTo(60, 6)
    expect(rigid.shortest).toBeCloseTo(60, 6)
    expect(rigid.settledAt).toBeLessThan(Number.POSITIVE_INFINITY)
    expect(strong.longest).toBeGreaterThan(reference.longest + 5)
  })
})

describe('txTabs styling contracts', () => {
  it('leaves the pointer as the only highlight on the active tab', () => {
    expect(TxTabsSource).toMatch(/\.tx-tabs:not\(\.tx-tabs--indicator-hidden\) \.tx-tabs__nav-inner :deep\(\.tx-tab-item\.is-active\) \{\s*--fake-color: transparent;/)
  })

  it('never eases the engine-written geometry with CSS', () => {
    expect(TxTabsSource).not.toMatch(/@keyframes tx-tabs-pointer/)
    const transitions = [...TxTabsSource.matchAll(/\.tx-tabs__pointer \{[^}]*\}|\.tx-tabs--indicator-anim \.tx-tabs__pointer \{[^}]*\}/g)].map(m => m[0])
    for (const rule of transitions)
      expect(rule).not.toMatch(/transition:[^;]*(transform|width|height)/)
    expect(TxTabsSource).toMatch(/@media \(prefers-reduced-motion: reduce\)/)
  })

  it('gives tab icons a box that sizes a glyph class', () => {
    expect(TxTabItemSource).toMatch(/\.tx-tab-item__icon \{\s*display: inline-flex;/)
  })

  // Checked on the compiled sheet: the reduced-motion rule must repeat the
  // exact selector of the transition it cuts — same specificity, later in the
  // sheet. A shorter one loses; `.tx-tabs__pointer-inner::before` alone left
  // the line / dot glow fading under reduced motion.
  it('cuts every pointer transition under reduced motion with a rule that outranks it', () => {
    const css = [...TxTabsSource.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)]
      .map(match => sass.compileString(match[1] ?? '', { syntax: 'scss' }).css)
      .join('\n')

    const at = css.indexOf('@media (prefers-reduced-motion: reduce)')
    expect(at).toBeGreaterThanOrEqual(0)
    const open = css.indexOf('{', at)
    let end = open
    for (let depth = 0; end < css.length; end++) {
      if (css[end] === '{')
        depth++
      else if (css[end] === '}' && --depth === 0)
        break
    }

    const rules = (text: string) => [...text.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(match => ({
      selectors: (match[1] ?? '').split(',').map(selector => selector.trim()),
      body: match[2] ?? '',
    }))
    const cut = new Set(rules(css.slice(open + 1, end))
      .filter(rule => /\btransition:\s*none/.test(rule.body))
      .flatMap(rule => rule.selectors))
    const tweened = rules(css.slice(0, at) + css.slice(end + 1))
      .filter(rule => /\btransition:\s*(?!none)/.test(rule.body))
      .flatMap(rule => rule.selectors)
      .filter(selector => selector.includes('tx-tabs__pointer'))

    // Both directions: there is a pointer tween to cut, and each one is cut.
    expect(tweened.length).toBeGreaterThan(0)
    for (const selector of tweened)
      expect(cut, `${selector} keeps its transition under reduced motion`).toContain(selector)
  })
})
