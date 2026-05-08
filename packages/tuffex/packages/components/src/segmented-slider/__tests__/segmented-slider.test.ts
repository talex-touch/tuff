import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import TxSegmentedSlider from '../src/TxSegmentedSlider.vue'

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
    expect(items[0]?.attributes('style')).toContain('left: 0%')
    expect(items[1]?.attributes('style')).toContain('left: 33.333')
    expect(items[2]?.attributes('aria-pressed')).toBe('true')
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

  it('emits model and change events from click and keyboard activation', async () => {
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

    await items[3]?.trigger('keydown', { key: 'Enter' })
    await items[2]?.trigger('keydown', { key: ' ' })

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
    await item?.trigger('keydown', { key: 'Enter' })

    expect(wrapper.classes()).toContain('is-disabled')
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
})
