import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import TxSlider from '../src/TxSlider.vue'

function setMainMetrics(wrapper: ReturnType<typeof mount>) {
  const main = wrapper.find('.tx-slider__main').element as HTMLElement
  main.getBoundingClientRect = () => ({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: 200,
    bottom: 24,
    width: 200,
    height: 24,
    toJSON: () => ({}),
  } as DOMRect)
}

describe('txSlider', () => {
  it('clamps displayed value and formats visible value', () => {
    const wrapper = mount(TxSlider, {
      props: {
        modelValue: 160,
        min: 10,
        max: 120,
        showValue: true,
        showTooltip: false,
        formatValue: value => `${value}%`,
      },
    })

    const input = wrapper.find('input')

    expect(input.element.value).toBe('120')
    expect(wrapper.find('.tx-slider__range').attributes('style')).toContain('width: 100%')
    expect(wrapper.find('.tx-slider__value').text()).toBe('120%')
  })

  it('emits clamped input and change values', async () => {
    const wrapper = mount(TxSlider, {
      props: {
        modelValue: 20,
        min: 0,
        max: 100,
        step: 5,
        showTooltip: false,
      },
    })

    const input = wrapper.find('input')
    await input.setValue('140')
    await input.trigger('change')

    expect(wrapper.emitted('update:modelValue')?.[0][0]).toBe(100)
    expect(wrapper.emitted('change')?.[0][0]).toBe(100)
  })

  it('blocks interaction and tooltip when disabled', async () => {
    const wrapper = mount(TxSlider, {
      props: {
        modelValue: 40,
        disabled: true,
        tooltipTrigger: 'always',
      },
    })

    await wrapper.find('input').trigger('pointerdown')
    await wrapper.find('input').setValue('60')

    expect(wrapper.classes()).toContain('is-disabled')
    expect(wrapper.find('.tx-slider__tooltip').exists()).toBe(false)
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  })

  it('shows hover tooltip with custom formatter and bottom placement', async () => {
    const wrapper = mount(TxSlider, {
      props: {
        modelValue: 40,
        tooltipTrigger: 'hover',
        tooltipPlacement: 'bottom',
        tooltipFormatter: value => `Value ${value}`,
        tooltipMotionDuration: -20,
        tooltipMotionBlurPx: -5,
      },
    })
    setMainMetrics(wrapper)

    await wrapper.find('.tx-slider__main').trigger('pointerenter')
    await nextTick()

    const tooltip = wrapper.find('.tx-slider__tooltip')
    expect(tooltip.exists()).toBe(true)
    expect(tooltip.text()).toBe('Value 40')
    expect(tooltip.attributes('data-motion')).toBe('blur')
    expect(tooltip.attributes('style')).toContain('--tx-slider-tooltip-motion-duration: 0ms')
    expect(tooltip.attributes('style')).toContain('--tx-slider-tooltip-motion-blur: 0px')
    expect(tooltip.attributes('style')).toContain('translateY(28px)')

    await wrapper.find('.tx-slider__main').trigger('pointerleave')
    await nextTick()
    expect(wrapper.find('.tx-slider__tooltip').exists()).toBe(false)
  })

  it('shows a non-transition tooltip when tooltipMotion is none', () => {
    const wrapper = mount(TxSlider, {
      props: {
        modelValue: 30,
        tooltipTrigger: 'always',
        tooltipMotion: 'none',
      },
    })

    const tooltip = wrapper.find('.tx-slider__tooltip')
    expect(tooltip.exists()).toBe(true)
    expect(tooltip.attributes('data-motion')).toBe('none')
  })

  it('cleans global pointer listeners on unmount', () => {
    const addSpy = vi.spyOn(window, 'addEventListener')
    const removeSpy = vi.spyOn(window, 'removeEventListener')
    const wrapper = mount(TxSlider)

    expect(addSpy).toHaveBeenCalledWith('pointerup', expect.any(Function))
    wrapper.unmount()
    expect(removeSpy).toHaveBeenCalledWith('pointerup', expect.any(Function))

    addSpy.mockRestore()
    removeSpy.mockRestore()
  })

  it('paints from the input while the parent has not echoed the value back', async () => {
    // Pre-fix the fill was derived from `modelValue`, so it only caught up after
    // emit -> parent -> prop. A parent that persists on write (storage/IPC) made the
    // fill visibly trail the native thumb for the whole drag.
    const wrapper = mount(TxSlider, {
      props: { modelValue: 0, min: 0, max: 100, showTooltip: false, showValue: true },
    })

    await wrapper.find('input').setValue('80')

    // `modelValue` is still 0 — the parent never wrote it back.
    expect(wrapper.props('modelValue')).toBe(0)
    expect(wrapper.find('.tx-slider__range').attributes('style')).toContain('width: 80%')
    expect(wrapper.find('.tx-slider__value').text()).toBe('80')
  })

  it('lets a parent that clamps the value override what was painted', async () => {
    const wrapper = mount(TxSlider, {
      props: { modelValue: 0, min: 0, max: 100, showTooltip: false, showValue: true },
    })

    await wrapper.find('input').setValue('80')
    expect(wrapper.find('.tx-slider__value').text()).toBe('80')

    await wrapper.setProps({ modelValue: 50 })
    expect(wrapper.find('.tx-slider__value').text()).toBe('50')
    expect(wrapper.find('.tx-slider__range').attributes('style')).toContain('width: 50%')
  })

  it('exposes hover and drag as classes that survive the pointer leaving the track', async () => {
    // Pre-fix `dragging` was tracked in JS but never reached the DOM, so the drag
    // visuals rode `:hover`/`:active` and collapsed the moment the pointer left the
    // element — which a drag does constantly, since it is captured on `window`.
    const wrapper = mount(TxSlider, { props: { modelValue: 40 } })

    await wrapper.find('.tx-slider__main').trigger('pointerenter')
    expect(wrapper.classes()).toContain('is-hovering')

    await wrapper.find('input').trigger('pointerdown')
    expect(wrapper.classes()).toContain('is-dragging')

    await wrapper.find('.tx-slider__main').trigger('pointerleave')
    expect(wrapper.classes()).not.toContain('is-hovering')
    expect(wrapper.classes()).toContain('is-dragging')

    window.dispatchEvent(new Event('pointerup'))
    await nextTick()
    expect(wrapper.classes()).not.toContain('is-dragging')
  })

  it('never reports hover or drag while disabled', async () => {
    const wrapper = mount(TxSlider, { props: { modelValue: 40, disabled: true } })

    await wrapper.find('.tx-slider__main').trigger('pointerenter')
    await wrapper.find('input').trigger('pointerdown')

    expect(wrapper.classes()).not.toContain('is-hovering')
    expect(wrapper.classes()).not.toContain('is-dragging')
  })

  it('does not raise the keyboard focus ring for a drag-initiated focus', async () => {
    const wrapper = mount(TxSlider, { props: { modelValue: 40 } })
    const input = wrapper.find('input')

    await input.trigger('pointerdown')
    await input.trigger('focus')

    expect(wrapper.classes()).not.toContain('is-focused')
  })

  it('names the range input and surfaces aria-valuetext only when a formatter is set', () => {
    // Pre-fix the input had no accessible name (a host aria-label landed on the
    // wrapper div) and a custom formatter was never announced to AT.
    const wrapper = mount(TxSlider, {
      props: {
        modelValue: 40,
        min: 0,
        max: 100,
        ariaLabel: '音量',
        formatValue: (value: number) => `${value}%`,
      },
    })

    const input = wrapper.find('input')
    expect(input.attributes('aria-label')).toBe('音量')
    expect(input.attributes('aria-valuetext')).toBe('40%')

    // Without a formatter the raw aria-valuenow suffices; no redundant valuetext.
    const plain = mount(TxSlider, {
      props: { modelValue: 40, min: 0, max: 100 },
    })
    expect(plain.find('input').attributes('aria-valuetext')).toBeUndefined()
  })
})
