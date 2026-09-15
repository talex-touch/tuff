import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { createApp, nextTick, ref } from 'vue'
import {
  BUILTIN_MORPH_ICONS,
  IconMorph,
  MorphIcon,
  TxIconMorph,
  TxMorphIcon,
  type TxIconMorphInstance,
} from '../index'

describe('txIconMorph (Vue component)', () => {
  it('renders initial SVG with canonical d and aria-hidden', () => {
    const wrapper = mount(TxIconMorph, {
      props: {
        icon: BUILTIN_MORPH_ICONS.menu,
      },
    })

    const svg = wrapper.find('svg')
    expect(svg.exists()).toBe(true)
    expect(svg.attributes('aria-hidden')).toBe('true')
    expect(svg.attributes('role')).toBeUndefined()
    expect(svg.attributes('width')).toBe('24')
    expect(svg.attributes('height')).toBe('24')
    expect(svg.attributes('viewBox')).toBe('0 0 24 24')
    expect(svg.attributes('fill')).toBe('none')
    expect(svg.attributes('stroke')).toBe('currentColor')
    expect(svg.attributes('stroke-width')).toBe('2')

    const path = wrapper.find('path')
    expect(path.exists()).toBe(true)
    expect(path.attributes('d')).toBe(BUILTIN_MORPH_ICONS.menu)
  })

  it('resolves built-in icon preset names', () => {
    const wrapper = mount(TxIconMorph, {
      props: {
        icon: 'close',
      },
    })

    const path = wrapper.find('path')
    expect(path.attributes('d')).toBe(BUILTIN_MORPH_ICONS.close)
  })

  it('renders accessibility title and role="img" when label is provided', () => {
    const wrapper = mount(TxIconMorph, {
      props: {
        icon: 'menu',
        label: 'Navigation Menu',
      },
    })

    const svg = wrapper.find('svg')
    expect(svg.attributes('role')).toBe('img')
    expect(svg.attributes('aria-hidden')).toBeUndefined()

    const title = wrapper.find('title')
    expect(title.exists()).toBe(true)
    expect(title.text()).toBe('Navigation Menu')
  })

  it('computes absoluteStrokeWidth correctly', () => {
    const wrapper = mount(TxIconMorph, {
      props: {
        icon: 'check',
        size: 48,
        strokeWidth: 2,
        absoluteStrokeWidth: true,
      },
    })

    const svg = wrapper.find('svg')
    // 2 * 24 / 48 = 1
    expect(svg.attributes('stroke-width')).toBe('1')
  })

  it('renders controlled mode endpoints (from, to, progress)', () => {
    const wrapperAt0 = mount(TxIconMorph, {
      props: {
        from: 'menu',
        to: 'close',
        progress: 0,
      },
    })
    expect(wrapperAt0.find('path').attributes('d')).toBe(BUILTIN_MORPH_ICONS.menu)

    const wrapperAt1 = mount(TxIconMorph, {
      props: {
        from: 'menu',
        to: 'close',
        progress: 1,
      },
    })
    expect(wrapperAt1.find('path').attributes('d')).toBe(BUILTIN_MORPH_ICONS.close)

    const wrapperMid = mount(TxIconMorph, {
      props: {
        from: 'menu',
        to: 'close',
        progress: 0.5,
      },
    })
    const midD = wrapperMid.find('path').attributes('d') ?? ''
    expect(midD.startsWith('M')).toBe(true)
    expect(midD).toContain('L')
    expect(midD).not.toBe(BUILTIN_MORPH_ICONS.menu)
    expect(midD).not.toBe(BUILTIN_MORPH_ICONS.close)
  })

  it('exposes imperative morphTo and set methods', async () => {
    const morphRef = ref<TxIconMorphInstance>()
    const wrapper = mount({
      components: { TxIconMorph },
      setup() {
        return { morphRef }
      },
      template: '<TxIconMorph ref="morphRef" icon="menu" />',
    })

    await nextTick()
    expect(morphRef.value).toBeDefined()
    expect(typeof morphRef.value?.morphTo).toBe('function')
    expect(typeof morphRef.value?.set).toBe('function')

    morphRef.value?.set('check')
    await nextTick()
    const path = wrapper.find('path')
    expect(path.attributes('d')).toBe(BUILTIN_MORPH_ICONS.check)
  })

  it('exports aliases MorphIcon, IconMorph, and TxMorphIcon', () => {
    expect(TxIconMorph).toBeDefined()
    expect(IconMorph).toBeDefined()
    expect(MorphIcon).toBeDefined()
    expect(TxMorphIcon).toBe(TxIconMorph)
    expect(MorphIcon).toBe(IconMorph)
  })

  it('installs via app.use', () => {
    const app = createApp({ template: '<div />' })
    app.use(IconMorph)
    expect(app.component('TxIconMorph')).toBeDefined()
  })

  it('handles late icon on iconless mount', async () => {
    const wrapper = mount(TxIconMorph, { props: {} })
    expect(wrapper.find('path').attributes('d')).toBe('')

    await wrapper.setProps({ icon: 'menu' })
    expect(wrapper.find('path').attributes('d')).toBe(BUILTIN_MORPH_ICONS.menu)
  })

  it('ignores icon prop changes while controlled pair is present', async () => {
    const wrapper = mount(TxIconMorph, {
      props: {
        from: 'menu',
        to: 'close',
        progress: 0.5,
        icon: 'menu',
      },
    })

    const initialD = wrapper.find('path').attributes('d')
    await wrapper.setProps({ icon: 'check' })
    expect(wrapper.find('path').attributes('d')).toBe(initialD)
  })

  it('cleans up on unmount', () => {
    const wrapper = mount(TxIconMorph, {
      props: { icon: 'menu' },
    })
    expect(() => wrapper.unmount()).not.toThrow()
  })
})
