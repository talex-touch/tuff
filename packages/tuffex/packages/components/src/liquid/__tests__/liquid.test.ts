import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { h, nextTick } from 'vue'
import TxLiquid from '../src/TxLiquid.vue'
import TxLiquidItem from '../src/TxLiquidItem.vue'

class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverStub)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('txLiquid', () => {
  it('renders the silhouette and melt overlay behind/above the slot content', async () => {
    const wrapper = mount(TxLiquid, {
      slots: { default: '<button class="content">Menu</button>' },
    })
    await nextTick()

    expect(wrapper.classes()).toContain('tx-liquid')
    expect(wrapper.find('svg[data-gooey-svg]').exists()).toBe(true)
    expect(wrapper.find('svg[data-gooey-overlay]').exists()).toBe(true)
    expect(wrapper.find('.content').text()).toBe('Menu')

    // The goo chain is built imperatively inside the <filter>.
    const filter = wrapper.find('filter')
    expect(filter.element.querySelector('feGaussianBlur')).toBeTruthy()
    expect(filter.element.querySelector('feColorMatrix')).toBeTruthy()
    expect(filter.element.querySelector('feComposite')).toBeTruthy()
  })

  it('splits the shadow list: blurred outer layers become CSS drop-shadow, spread/inset stay SVG passes', async () => {
    const wrapper = mount(TxLiquid, {
      props: { shadow: '0 2px 6px rgba(0,0,0,.2), inset 0 0 0 1px rgba(255,255,255,.4)' },
    })
    await nextTick()

    const svg = wrapper.find('svg[data-gooey-svg]')
    expect(svg.attributes('style')).toContain('drop-shadow(0px 2px 6px rgba(0,0,0,.2))')
    expect(svg.element.querySelector('feMerge')).toBeTruthy()
    expect(svg.element.querySelector('feFlood')?.getAttribute('flood-color')).toBe('rgba(255,255,255,.4)')
  })

  it('mirrors morph items into the silhouette as blobs', async () => {
    const wrapper = mount(TxLiquid, {
      slots: {
        default: () => [
          h(TxLiquidItem, null, () => h('button', 'A')),
          h(TxLiquidItem, null, () => h('button', 'B')),
        ],
      },
    })
    await nextTick()

    const portal = wrapper.findAll('svg[data-gooey-svg] g')[0]!
    expect(portal.element.querySelectorAll('rect')).toHaveLength(2)
  })

  it('registers observed items (dissolve) with a blob and a melt host', async () => {
    const wrapper = mount(TxLiquid, {
      slots: {
        default: () => h(TxLiquidItem, { dissolve: true }, () => h('button', 'A')),
      },
    })
    await nextTick()

    expect(wrapper.find('svg[data-gooey-svg] g rect').exists()).toBe(true)
    const melt = wrapper.find('svg[data-gooey-overlay] g g g')
    expect(melt.exists()).toBe(true)
    expect(melt.attributes('opacity')).toBe('0')
  })

  it('throws when an item is mounted outside a group', () => {
    expect(() => mount(TxLiquidItem)).toThrow(/inside a <TxLiquid> group/)
  })
})
