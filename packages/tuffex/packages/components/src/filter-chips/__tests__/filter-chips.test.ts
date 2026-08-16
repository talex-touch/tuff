import type { FilterChipItem } from '../src/types'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import TxFilterChips from '../src/TxFilterChips.vue'

const items: FilterChipItem[] = [
  { value: 'all', label: 'All', count: 5 },
  { value: 'todo', label: 'To do', dot: '#f09a2f', count: 2 },
  { value: 'progress', label: 'In Progress', dot: '#16a6c7', count: 2 },
  { value: 'done', label: 'Completed', dot: '#25a878', count: 1 },
]

describe('txFilterChips', () => {
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
