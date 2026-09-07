import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import TxSegmentedSlider from '../src/TxSegmentedSlider.vue'
import sliderSource from '../src/TxSegmentedSlider.vue?raw'

const segments = [
  { value: 0, label: 'Small' },
  { value: 1, label: 'Medium' },
  { value: 2, label: 'Large' },
  { value: 'xl', label: 'XL' },
]

describe('txSegmentedSlider', () => {
  it('renders horizontal progress, segment positions, and active state', () => {
    const wrapper = mount(TxSegmentedSlider, {
      props: {
        modelValue: 2,
        segments,
      },
    })

    const progress = wrapper.find('.tx-segmented-slider__progress')
    const items = wrapper.findAll('.tx-segmented-slider__segment')

    expect(progress.attributes('style')).toContain('width: 66.666')
    expect(items).toHaveLength(4)
    expect(items.map(item => item.element.tagName)).toEqual(['BUTTON', 'BUTTON', 'BUTTON', 'BUTTON'])
    expect(items[0]?.attributes('type')).toBe('button')
    expect(items[0]?.attributes('role')).toBe('radio')
    expect(items[0]?.attributes('style')).toContain('left: 0%')
    expect(items[1]?.attributes('style')).toContain('left: 33.333')
    expect(items[2]?.attributes('aria-checked')).toBe('true')
    expect(items[2]?.classes()).toContain('is-active')
    expect(items[0]?.classes()).toContain('is-completed')
    expect(items[1]?.classes()).toContain('is-completed')
    expect(wrapper.text()).toContain('Large')
  })

  it('uses vertical height and bottom positions in vertical mode', () => {
    const wrapper = mount(TxSegmentedSlider, {
      props: {
        modelValue: 'xl',
        segments,
        vertical: true,
      },
    })

    const progress = wrapper.find('.tx-segmented-slider__progress')
    const items = wrapper.findAll('.tx-segmented-slider__segment')

    expect(wrapper.classes()).toContain('is-vertical')
    expect(progress.attributes('style')).toContain('height: 100%')
    expect(progress.attributes('style')).not.toContain('width:')
    expect(items[0]?.attributes('style')).toContain('bottom: 0%')
    expect(items[3]?.attributes('style')).toContain('bottom: 100%')
  })

  it('emits model and change events from segment clicks', async () => {
    const wrapper = mount(TxSegmentedSlider, {
      props: {
        modelValue: 0,
        segments,
      },
    })

    const items = wrapper.findAll('.tx-segmented-slider__segment')

    await items[1]?.trigger('click')
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([1])
    expect(wrapper.emitted('change')?.[0]).toEqual([1])

    await items[3]?.trigger('click')
    await items[2]?.trigger('click')

    expect(wrapper.emitted('update:modelValue')?.[1]).toEqual(['xl'])
    expect(wrapper.emitted('change')?.[1]).toEqual(['xl'])
    expect(wrapper.emitted('update:modelValue')?.[2]).toEqual([2])
    expect(wrapper.emitted('change')?.[2]).toEqual([2])
  })

  it('does not emit when disabled', async () => {
    const wrapper = mount(TxSegmentedSlider, {
      props: {
        modelValue: 0,
        segments,
        disabled: true,
      },
    })

    const item = wrapper.findAll('.tx-segmented-slider__segment')[1]

    await item?.trigger('click')

    expect(wrapper.classes()).toContain('is-disabled')
    expect(item?.attributes('disabled')).toBeDefined()
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    expect(wrapper.emitted('change')).toBeUndefined()
  })

  it('hides labels when showLabels is false', () => {
    const wrapper = mount(TxSegmentedSlider, {
      props: {
        modelValue: 0,
        segments,
        showLabels: false,
      },
    })

    expect(wrapper.find('.tx-segmented-slider__label').exists()).toBe(false)
  })

  it('auto-selects the first segment when mounted with null modelValue', () => {
    const wrapper = mount(TxSegmentedSlider, {
      props: {
        modelValue: null,
        segments,
      },
    })

    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([0])
  })

  it('names every segment via aria-label even when labels are hidden or missing', () => {
    const wrapper = mount(TxSegmentedSlider, {
      props: {
        modelValue: 1,
        showLabels: false,
        segments: [
          { value: 0, label: 'Low' },
          { value: 1, label: 'High' },
          { value: 2 },
        ],
      },
    })

    const buttons = wrapper.findAll('.tx-segmented-slider__segment')
    // Pre-fix, with labels hidden each button held only an empty dot span and had
    // no accessible name.
    expect(buttons[0].attributes('aria-label')).toBe('Low')
    expect(buttons[1].attributes('aria-label')).toBe('High')
    // A segment with no label falls back to its stringified value.
    expect(buttons[2].attributes('aria-label')).toBe('2')
  })
})

describe('txSegmentedSlider stops and keyboard', () => {
  const segments = [
    { value: 's', label: 'S' },
    { value: 'm', label: 'M' },
    { value: 'l', label: 'L' },
  ]

  function mountSlider(props: Record<string, unknown> = {}) {
    return mount(TxSegmentedSlider, { props: { segments, modelValue: 'm', ...props } })
  }

  it('is one radio group with a single tab stop on the current value', () => {
    const wrapper = mountSlider()

    expect(wrapper.attributes('role')).toBe('radiogroup')
    expect(wrapper.attributes('aria-orientation')).toBe('horizontal')

    const stops = wrapper.findAll('.tx-segmented-slider__segment')
    // Roving tabindex: Tab reaches the row once and lands on the current stop.
    expect(stops.map(stop => stop.attributes('tabindex'))).toEqual(['-1', '0', '-1'])
    expect(stops[1]?.attributes('aria-checked')).toBe('true')
    expect(stops[0]?.attributes('aria-checked')).toBe('false')
  })

  it('moves the value with the arrow keys and clamps at both ends', async () => {
    const wrapper = mountSlider()

    await wrapper.trigger('keydown', { key: 'ArrowRight' })
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['l'])
    expect(wrapper.emitted('change')?.[0]).toEqual(['l'])

    await wrapper.trigger('keydown', { key: 'ArrowLeft' })
    expect(wrapper.emitted('update:modelValue')?.[1]).toEqual(['s'])

    await wrapper.trigger('keydown', { key: 'Home' })
    // Already at index 0 from the caller's point of view (modelValue is still
    // 'm'), so Home lands on 's' and re-emitting the same value is suppressed.
    await wrapper.setProps({ modelValue: 's' })
    await wrapper.trigger('keydown', { key: 'ArrowLeft' })
    expect(wrapper.emitted('update:modelValue')).toHaveLength(3)

    await wrapper.trigger('keydown', { key: 'End' })
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['l'])
  })

  it('reverses the arrow axis when stacked vertically', async () => {
    const wrapper = mountSlider({ vertical: true })

    expect(wrapper.attributes('aria-orientation')).toBe('vertical')
    // Bottom-to-top: Up advances.
    await wrapper.trigger('keydown', { key: 'ArrowUp' })
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['l'])

    await wrapper.trigger('keydown', { key: 'ArrowDown' })
    expect(wrapper.emitted('update:modelValue')?.[1]).toEqual(['s'])
  })

  it('ignores the keyboard while disabled', async () => {
    const wrapper = mountSlider({ disabled: true })

    await wrapper.trigger('keydown', { key: 'ArrowRight' })
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    expect(wrapper.findAll('.tx-segmented-slider__segment').map(s => s.attributes('tabindex')))
      .toEqual(['-1', '-1', '-1'])
  })

  it('draws round stops rather than a bare border stroke', () => {
    // A `<span>` is inline, so width and height were dropped and the 2px border
    // rendered as a vertical stroke on the track.
    const source = sliderSource
    const dot = source.slice(source.indexOf('&__dot {'))
    expect(dot.slice(0, dot.indexOf('}'))).toContain('display: block')
  })
})
