import type { FilterChipItem } from '../src/types'
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import TxFilterChips from '../src/TxFilterChips.vue'

const items: FilterChipItem[] = [
  { value: 'all', label: 'All', count: 5 },
  { value: 'todo', label: 'To do', dot: '#f09a2f', count: 2 },
  { value: 'progress', label: 'In Progress', dot: '#16a6c7', count: 2 },
  { value: 'done', label: 'Completed', dot: '#25a878', count: 1 },
]

describe('txFilterChips', () => {
  it('draws a leading icon when the chip declares one, and nothing when it does not', () => {
    const wrapper = mount(TxFilterChips, {
      props: {
        items: [
          { value: 'starred', label: 'Favorites', iconClass: 'i-ri-star-line' },
          { value: 'all', label: 'All' },
        ],
        modelValue: 'starred',
      },
    })

    const chips = wrapper.findAll('.tx-bui-filter-chips__chip')
    const icon = chips[0].find('.tx-bui-filter-chips__icon')
    expect(icon.exists()).toBe(true)
    expect(icon.classes()).toContain('i-ri-star-line')
    // Decorative: the label is what names the chip.
    expect(icon.attributes('aria-hidden')).toBe('true')
    expect(chips[0].text()).toBe('Favorites')
    expect(chips[1].find('.tx-bui-filter-chips__icon').exists()).toBe(false)
  })

  it('hides the words under iconOnly but keeps naming the chip, and leaves an iconless chip alone', () => {
    const wrapper = mount(TxFilterChips, {
      props: {
        items: [
          { value: 'starred', label: 'Favorites', iconClass: 'i-ri-star-line' },
          { value: 'all', label: 'All' },
        ],
        modelValue: 'starred',
        iconOnly: true,
      },
    })

    const chips = wrapper.findAll('.tx-bui-filter-chips__chip')
    // The glyph stands alone; the name moves where a screen reader and a hover can still reach it.
    expect(chips[0].classes()).toContain('is-icon-only')
    expect(chips[0].find('.tx-bui-filter-chips__label').exists()).toBe(false)
    expect(chips[0].attributes('aria-label')).toBe('Favorites')
    expect(chips[0].attributes('title')).toBe('Favorites')
    // No icon to stand in for the words, so the words stay.
    expect(chips[1].classes()).not.toContain('is-icon-only')
    expect(chips[1].text()).toBe('All')
    expect(chips[1].attributes('aria-label')).toBeUndefined()
  })

  it('renders one native button per chip with dot and count', () => {
    const wrapper = mount(TxFilterChips, { props: { items, modelValue: 'all' } })

    const chips = wrapper.findAll('.tx-bui-filter-chips__chip')
    expect(chips).toHaveLength(4)
    expect(chips[0].element.tagName).toBe('BUTTON')
    expect(chips[0].attributes('type')).toBe('button')
    expect(chips[1].find('.tx-bui-filter-chips__dot').attributes('style')).toContain('background: rgb(240, 154, 47)')
    expect(chips[1].find('.tx-bui-filter-chips__count').text()).toBe('2')
    // 'All' declares no dot, so none is drawn.
    expect(chips[0].find('.tx-bui-filter-chips__dot').exists()).toBe(false)
  })

  it('marks the selected chip as a pressed toolbar button by default', () => {
    const wrapper = mount(TxFilterChips, { props: { items, modelValue: 'todo' } })

    expect(wrapper.attributes('role')).toBe('toolbar')
    const chips = wrapper.findAll('.tx-bui-filter-chips__chip')
    expect(chips[1].attributes('aria-pressed')).toBe('true')
    expect(chips[0].attributes('aria-pressed')).toBe('false')
    expect(chips[1].classes()).toContain('is-active')
    expect(chips[1].attributes('aria-selected')).toBeUndefined()
  })

  it('switches to tab semantics in tablist mode', () => {
    const wrapper = mount(TxFilterChips, {
      props: { items, modelValue: 'done', role: 'tablist' },
    })

    expect(wrapper.attributes('role')).toBe('tablist')
    const chips = wrapper.findAll('.tx-bui-filter-chips__chip')
    expect(chips[3].attributes('role')).toBe('tab')
    expect(chips[3].attributes('aria-selected')).toBe('true')
    expect(chips[3].attributes('aria-pressed')).toBeUndefined()
  })

  it('emits both v-model and change on click, and stays quiet on the active chip', async () => {
    const wrapper = mount(TxFilterChips, { props: { items, modelValue: 'all' } })
    const chips = wrapper.findAll('.tx-bui-filter-chips__chip')

    await chips[2].trigger('click')
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['progress'])
    expect(wrapper.emitted('change')?.[0]).toEqual(['progress'])

    await chips[0].trigger('click')
    expect(wrapper.emitted('update:modelValue')).toHaveLength(1)
  })

  it('keeps a single tab stop on the selected chip', () => {
    const wrapper = mount(TxFilterChips, { props: { items, modelValue: 'progress' } })
    const tabindexes = wrapper.findAll('.tx-bui-filter-chips__chip').map(c => c.attributes('tabindex'))

    expect(tabindexes).toEqual(['-1', '-1', '0', '-1'])
  })

  it('falls back the tab stop to the first enabled chip when nothing is selected', () => {
    const wrapper = mount(TxFilterChips, {
      props: { items: [{ value: 'a', label: 'A', disabled: true }, ...items] },
    })
    const tabindexes = wrapper.findAll('.tx-bui-filter-chips__chip').map(c => c.attributes('tabindex'))

    expect(tabindexes[0]).toBe('-1')
    expect(tabindexes[1]).toBe('0')
  })

  it('moves focus with arrow keys without changing the filter in toolbar mode', async () => {
    const wrapper = mount(TxFilterChips, {
      props: { items, modelValue: 'all' },
      attachTo: document.body,
    })
    const chips = wrapper.findAll('.tx-bui-filter-chips__chip')

    await chips[0].trigger('keydown', { key: 'ArrowRight' })
    expect(document.activeElement).toBe(chips[1].element)
    // A toolbar is a set of toggles: focus moves, the filter does not.
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()

    await chips[1].trigger('keydown', { key: 'ArrowLeft' })
    expect(document.activeElement).toBe(chips[0].element)

    await chips[0].trigger('keydown', { key: 'End' })
    expect(document.activeElement).toBe(chips[3].element)

    await chips[3].trigger('keydown', { key: 'Home' })
    expect(document.activeElement).toBe(chips[0].element)

    wrapper.unmount()
  })

  it('wraps arrow navigation and skips disabled chips', async () => {
    const withDisabled: FilterChipItem[] = [
      { value: 'a', label: 'A' },
      { value: 'b', label: 'B', disabled: true },
      { value: 'c', label: 'C' },
    ]
    const wrapper = mount(TxFilterChips, {
      props: { items: withDisabled, modelValue: 'a' },
      attachTo: document.body,
    })
    const chips = wrapper.findAll('.tx-bui-filter-chips__chip')

    await chips[0].trigger('keydown', { key: 'ArrowRight' })
    expect(document.activeElement).toBe(chips[2].element)

    await chips[2].trigger('keydown', { key: 'ArrowRight' })
    expect(document.activeElement).toBe(chips[0].element)

    wrapper.unmount()
  })

  it('selects on focus move in tablist mode', async () => {
    const wrapper = mount(TxFilterChips, {
      props: { items, modelValue: 'all', role: 'tablist' },
      attachTo: document.body,
    })
    const chips = wrapper.findAll('.tx-bui-filter-chips__chip')

    await chips[0].trigger('keydown', { key: 'ArrowRight' })
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['todo'])

    wrapper.unmount()
  })

  it('does not select a disabled chip', async () => {
    const wrapper = mount(TxFilterChips, {
      props: { items, modelValue: 'all', disabled: true },
    })

    await wrapper.findAll('.tx-bui-filter-chips__chip')[2].trigger('click')
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    expect(wrapper.findAll('.tx-bui-filter-chips__chip')[2].attributes('disabled')).toBeDefined()
  })

  it('lets the chip slot replace the chip body while keeping the button shell', () => {
    const wrapper = mount(TxFilterChips, {
      props: { items, modelValue: 'all' },
      slots: {
        chip: `<template #chip="{ item, active }"><span class="custom">{{ item.label }}:{{ active }}</span></template>`,
      },
    })

    const chips = wrapper.findAll('.tx-bui-filter-chips__chip')
    expect(chips[0].find('.custom').text()).toBe('All:true')
    expect(chips[1].find('.custom').text()).toBe('To do:false')
    expect(chips[0].element.tagName).toBe('BUTTON')
    expect(wrapper.find('.tx-bui-filter-chips__count').exists()).toBe(false)
  })
})

/**
 * The active fill is one element that moves, so what has to hold is that it
 * reads its box off the *active* chip, in the row's own scrolled coordinate
 * space, and that it does not travel to a position nobody asked to see move.
 *
 * jsdom lays nothing out, so the chip offsets are stubbed: the assertions are
 * about which chip is measured and when, which is the part that can break.
 */
/**
 * The props are declared as a runtime object, not `defineProps<FilterChipsProps>()`. The
 * type-only form resolves the interface from `types.ts` at compile time, and the dev server does
 * not recompile this SFC when that file changes — `iconOnly` was added to the interface, vitest
 * (a cold compile) passed, and the running app kept treating it as an unknown attribute. Every
 * key of the public interface must be a declared runtime prop, or the type is lying.
 */
describe('txFilterChips props declaration', () => {
  it('declares every key of FilterChipsProps at runtime, so the compiler never has to guess', () => {
    const declared = Object.keys((TxFilterChips as { props: Record<string, unknown> }).props).sort()
    expect(declared).toEqual(['ariaLabel', 'disabled', 'iconOnly', 'indicator', 'items', 'modelValue', 'role'])
  })
})

describe('txFilterChips active-fill indicator', () => {
  function stubOffsets(wrapper: ReturnType<typeof mount>): void {
    wrapper.findAll('.tx-bui-filter-chips__chip').forEach((chip, index) => {
      Object.defineProperties(chip.element, {
        offsetLeft: { value: index * 100, configurable: true },
        offsetTop: { value: 4, configurable: true },
        offsetWidth: { value: 90, configurable: true },
        offsetHeight: { value: 26, configurable: true },
      })
    })
  }

  it('takes its box from the active chip and follows the selection', async () => {
    const wrapper = mount(TxFilterChips, {
      attachTo: document.body,
      props: { items, modelValue: 'all' },
    })
    stubOffsets(wrapper)

    await wrapper.setProps({ modelValue: 'progress' })
    await nextTick()

    const style = wrapper.attributes('style') ?? ''
    // Third chip: 2 × 100.
    expect(style).toContain('--tx-bui-filter-chips-indicator-x: 200px')
    expect(style).toContain('--tx-bui-filter-chips-indicator-y: 4px')
    expect(style).toContain('--tx-bui-filter-chips-indicator-w: 90px')
    expect(style).toContain('--tx-bui-filter-chips-indicator-h: 26px')
    expect(wrapper.find('.tx-bui-filter-chips__indicator').exists()).toBe(true)
    expect(wrapper.classes()).toContain('is-sliding')

    wrapper.unmount()
  })

  it('draws nothing rather than parking the fill on the first chip when nothing is active', async () => {
    const wrapper = mount(TxFilterChips, {
      attachTo: document.body,
      props: { items, modelValue: 'all' },
    })
    stubOffsets(wrapper)
    await wrapper.setProps({ modelValue: 'gone' })
    await nextTick()

    expect(wrapper.find('.tx-bui-filter-chips__indicator').exists()).toBe(false)

    wrapper.unmount()
  })

  it('leaves the fill on the chips when the indicator is off', async () => {
    const wrapper = mount(TxFilterChips, {
      attachTo: document.body,
      props: { items, modelValue: 'all', indicator: false },
    })
    stubOffsets(wrapper)
    await wrapper.setProps({ modelValue: 'todo' })
    await nextTick()

    expect(wrapper.find('.tx-bui-filter-chips__indicator').exists()).toBe(false)
    // Without `is-sliding` the chip's own `.is-active` fill is the one that paints.
    expect(wrapper.classes()).not.toContain('is-sliding')
    expect(wrapper.findAll('.tx-bui-filter-chips__chip')[1].classes()).toContain('is-active')

    wrapper.unmount()
  })

  it('keeps the no-travel guard up until the frame after the new box is written', async () => {
    // The order is the bug that shipped: lifting `is-placing` in the same frame the width is
    // written re-arms the transition mid-write, and the fill tweens up from 0 — paints 0-wide.
    const frames: FrameRequestCallback[] = []
    const raf = vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((cb) => {
      frames.push(cb)
      return frames.length
    })
    try {
      const wrapper = mount(TxFilterChips, {
        attachTo: document.body,
        props: { items, modelValue: 'todo' },
      })
      stubOffsets(wrapper)
      await wrapper.setProps({ items: [...items] })
      await nextTick()
      // Geometry is written…
      expect(wrapper.attributes('style')).toContain('--tx-bui-filter-chips-indicator-w: 90px')
      // …and the guard is still up: nothing may have lifted it before the DOM write landed.
      expect(wrapper.classes()).toContain('is-placing')
      // Only the deferred frame lifts it.
      expect(frames.length).toBeGreaterThan(0)
      frames.splice(0).forEach((cb) => cb(0))
      await nextTick()
      expect(wrapper.classes()).not.toContain('is-placing')
      wrapper.unmount()
    }
    finally {
      raf.mockRestore()
    }
  })

  it('re-measures a rebuilt chip list without travelling to the new position', async () => {
    const wrapper = mount(TxFilterChips, {
      attachTo: document.body,
      props: { items, modelValue: 'todo' },
    })
    stubOffsets(wrapper)

    // A host that refetches its options hands over a new array; the user picked
    // nothing, so the fill must land rather than slide.
    await wrapper.setProps({ items: [...items] })
    await nextTick()

    expect(wrapper.classes()).toContain('is-placing')

    wrapper.unmount()
  })
})
