import type { VueWrapper } from '@vue/test-utils'
import { mount } from '@vue/test-utils'
import * as sass from 'sass'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import TxTabBar from '../src/TxTabBar.vue'
import tabBarSource from '../src/TxTabBar.vue?raw'

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

  it.each(['pill', 'line', 'block', 'dot'] as const)('renders the %s indicator variant', async (indicator) => {
    const wrapper = mount(TxTabBar, { props: { items, modelValue: 'home', indicator, fixed: false } })

    // The node appears once the first measurement has landed, a tick after
    // mount. jsdom's all-zero rects are still a measurement.
    await nextTick()
    const el = wrapper.find('.tx-tab-bar__indicator')
    expect(el.exists()).toBe(true)
    expect(el.classes()).toContain(`is-${indicator}`)
  })

  it('renders no indicator element when indicator is none', async () => {
    const wrapper = mount(TxTabBar, {
      props: { items, modelValue: 'home', indicator: 'none', fixed: false },
    })

    await nextTick()
    expect(wrapper.find('.tx-tab-bar__indicator').exists()).toBe(false)
  })
})

// Three enabled destinations, so every item can be the target.
const open = [
  { value: 'a', label: 'A' },
  { value: 'b', label: 'B' },
  { value: 'c', label: 'C' },
]

/** jsdom lays nothing out: `itemWidth`-wide items in a 56px (md) bar that is exactly as wide as they are. */
function layOut(wrapper: VueWrapper<any>, itemWidth: number): void {
  const stubRect = (el: Element, left: number, width: number) => {
    el.getBoundingClientRect = () => ({
      top: 0,
      left,
      width,
      height: 56,
      right: left + width,
      bottom: 56,
      x: left,
      y: 0,
      toJSON: () => ({}),
    }) as DOMRect
  }
  const inner = wrapper.find('.tx-tab-bar__inner').element
  const buttons = wrapper.findAll('.tx-tab-bar__item')
  const barWidth = buttons.length * itemWidth
  stubRect(inner, 0, barWidth)
  // The walls are the row's own padding box.
  Object.defineProperty(inner, 'clientWidth', { configurable: true, value: barWidth })
  buttons.forEach((button, index) => stubRect(button.element, index * itemWidth, itemWidth))
}

function readIndicator(wrapper: VueWrapper<any>) {
  const style = wrapper.find('.tx-tab-bar__indicator').attributes('style') ?? ''
  const move = style.match(/translate3d\(([\d.-]+)px, ([\d.-]+)px, 0\) scale\(([\d.]+), ([\d.]+)\)/)
  return {
    style,
    x: Number(move?.[1]),
    y: Number(move?.[2]),
    scaleX: Number(move?.[3]),
    scaleY: Number(move?.[4]),
    width: Number(style.match(/(?:^|;\s*)width: ([\d.]+)px/)?.[1]),
    height: Number(style.match(/(?:^|;\s*)height: ([\d.]+)px/)?.[1]),
  }
}

describe('txTabBar indicator on the glide material', () => {
  beforeEach(() => {
    // The engine steps on requestAnimationFrame.
    vi.useFakeTimers({
      toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance'],
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('glides to a new selection, lengthening on the way without scaling, and settles on its box', async () => {
    const wrapper = mount(TxTabBar, { props: { items: open, modelValue: 'a', fixed: false } })
    layOut(wrapper, 100)

    // The first measurement lands in place, inset 8px / 6px at md.
    await nextTick()
    expect(readIndicator(wrapper).style).toContain('translate3d(8px, 6px, 0) scale(1.000, 1.000)')
    expect(readIndicator(wrapper).style).toContain('width: 84px')
    expect(readIndicator(wrapper).style).toContain('height: 44px')

    await wrapper.setProps({ modelValue: 'b' })

    // It travels rather than jumping. The end facing the new item leads, so
    // the 84px pill runs longer on the way (about 98px) and gathers on the
    // item; it never scales, so it never grows out of the bar's 6px insets.
    let midFlight = false
    let longest = 0
    for (let frame = 0; frame < 250; frame++) {
      vi.advanceTimersByTime(16)
      const { x, width, height, scaleX, scaleY } = readIndicator(wrapper)
      expect([scaleX, scaleY]).toEqual([1, 1])
      expect(height).toBe(44)
      if (x > 8 && x < 108)
        midFlight = true
      longest = Math.max(longest, width)
    }
    expect(midFlight).toBe(true)
    expect(longest).toBeGreaterThan(84 + 5)

    expect(readIndicator(wrapper).style).toContain('translate3d(108px, 6px, 0) scale(1.000, 1.000)')
    expect(readIndicator(wrapper).style).toContain('width: 84px')
    expect(readIndicator(wrapper).style).toContain('height: 44px')
  })

  // The gallery and the demos frame the bar with `overflow: hidden`, so any
  // paint past its ends is cut off flat. The walls stop each end of the
  // indicator at the bar's span; the glide never scales, so the painted box is
  // exactly the written one, and it lengthens only between the walls.
  it.each(['pill', 'line'] as const)('keeps the %s inside the bar at both ends', async (indicator) => {
    const wrapper = mount(TxTabBar, { props: { items: open, modelValue: 'a', fixed: false, indicator } })
    layOut(wrapper, 106)
    await nextTick()
    const home = readIndicator(wrapper).style

    let travelled = false
    for (const value of ['c', 'a']) {
      await wrapper.setProps({ modelValue: value })
      for (let frame = 0; frame < 150; frame++) {
        vi.advanceTimersByTime(16)
        const { x, y, width, height, scaleX, scaleY } = readIndicator(wrapper)
        expect([scaleX, scaleY]).toEqual([1, 1])
        expect(x).toBeGreaterThanOrEqual(0)
        expect(x + width).toBeLessThanOrEqual(318)
        expect(y).toBeGreaterThanOrEqual(0)
        expect(y + height).toBeLessThanOrEqual(56)
        if (x > 20 && x < 200)
          travelled = true
      }
    }

    expect(travelled).toBe(true)
    expect(readIndicator(wrapper).style).toBe(home)
  })

  it('lands a change of variant or size in place instead of travelling', async () => {
    const wrapper = mount(TxTabBar, { props: { items: open, modelValue: 'b', fixed: false } })
    layOut(wrapper, 100)
    await nextTick()
    expect(readIndicator(wrapper).style).toContain('translate3d(108px, 6px, 0) scale(1.000, 1.000)')

    // A new box on the same item: no frame has run, and it is already there.
    await wrapper.setProps({ indicator: 'line' })
    expect(readIndicator(wrapper).style).toContain('translate3d(100px, 0px, 0) scale(1.000, 1.000)')
    expect(readIndicator(wrapper).style).toContain('width: 100px')
    expect(readIndicator(wrapper).style).toContain('height: 2px')

    // lg insets the pill 10px / 7px.
    await wrapper.setProps({ indicator: 'pill', size: 'lg' })
    expect(readIndicator(wrapper).style).toContain('translate3d(110px, 7px, 0) scale(1.000, 1.000)')
    expect(readIndicator(wrapper).style).toContain('width: 80px')
    expect(readIndicator(wrapper).style).toContain('height: 42px')
  })

  it('lands a new selection directly under prefers-reduced-motion', async () => {
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
      const wrapper = mount(TxTabBar, { props: { items: open, modelValue: 'a', fixed: false } })
      layOut(wrapper, 100)
      await nextTick()

      await wrapper.setProps({ modelValue: 'c' })
      expect(readIndicator(wrapper).style).toContain('translate3d(208px, 6px, 0) scale(1.000, 1.000)')
    }
    finally {
      window.matchMedia = original
    }
  })
})

// `transition` values nest commas inside `var(...)` and `cubic-bezier(...)`.
function splitTopLevel(value: string): string[] {
  const out: string[] = []
  let depth = 0
  let current = ''
  for (const ch of value) {
    if (ch === '(')
      depth += 1
    else if (ch === ')')
      depth -= 1
    if (ch === ',' && depth === 0) {
      out.push(current.trim())
      current = ''
    }
    else {
      current += ch
    }
  }
  if (current.trim())
    out.push(current.trim())
  return out
}

describe('txTabBar indicator styles', () => {
  it('eases only the fade, never the geometry the engine writes', () => {
    // Compiled, so a transition nested under a variant or a media query
    // counts. One on transform, width or height would re-ease every frame the
    // engine writes, and the indicator would trail its own spring.
    const css = [...tabBarSource.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)]
      .map(([, block = '']) => sass.compileString(block, { syntax: 'scss' }).css)
      .join('\n')

    const transitioned: string[][] = []
    for (const [, selector = '', body = ''] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      if (!selector.includes('.tx-tab-bar__indicator'))
        continue
      for (const [, value = ''] of body.matchAll(/transition(?:-property)?\s*:\s*([^;]+)/g))
        transitioned.push(splitTopLevel(value).map(segment => segment.split(/\s+/)[0] ?? ''))
    }

    // The rule and its reduced-motion twin both keep the fade.
    expect(transitioned).toEqual([['opacity'], ['opacity']])
    expect(css).toMatch(/prefers-reduced-motion:\s*reduce/)
  })
})
