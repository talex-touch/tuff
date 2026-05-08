import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import TxFusion from '../src/TxFusion.vue'

describe('txFusion', () => {
  it('renders both slots and maps visual props to CSS variables and SVG filter', () => {
    const wrapper = mount(TxFusion, {
      props: {
        direction: 'y',
        gap: 64,
        duration: -20,
        easing: 'linear',
        blur: 12,
        alpha: 31,
        alphaOffset: -8,
      },
      slots: {
        a: '<span>A</span>',
        b: '<span>B</span>',
      },
    })

    expect(wrapper.text()).toContain('A')
    expect(wrapper.text()).toContain('B')
    expect(wrapper.classes()).toContain('is-dir-y')

    const stageStyle = wrapper.find('.tx-fusion__stage').attributes('style')
    expect(stageStyle).toContain('--tx-fusion-duration: 0ms')
    expect(stageStyle).toContain('--tx-fusion-easing: linear')
    expect(stageStyle).toContain('--tx-fusion-gap: 64px')
    expect(stageStyle).toContain('--tx-fusion-blur: 12px')

    expect(wrapper.find('feGaussianBlur').attributes('stdDeviation')).toBe('12')
    expect(wrapper.find('feColorMatrix').attributes('values')).toContain('31 -8')
    expect(wrapper.find('.tx-fusion__goo').attributes('style')).toContain('filter: url(#tx-fusion-goo-')
  })

  it('uses hover trigger in uncontrolled mode', async () => {
    const wrapper = mount(TxFusion)

    await wrapper.trigger('mouseenter')
    expect(wrapper.classes()).toContain('is-active')
    expect(wrapper.emitted('update:modelValue')?.[0][0]).toBe(true)
    expect(wrapper.emitted('change')?.[0][0]).toBe(true)

    await wrapper.trigger('mouseleave')
    expect(wrapper.classes()).not.toContain('is-active')
    expect(wrapper.emitted('update:modelValue')?.[1][0]).toBe(false)
  })

  it('uses click trigger without mutating controlled active state', async () => {
    const wrapper = mount(TxFusion, {
      props: {
        modelValue: false,
        trigger: 'click',
      },
    })

    await wrapper.trigger('click')
    expect(wrapper.classes()).not.toContain('is-active')
    expect(wrapper.emitted('update:modelValue')?.[0][0]).toBe(true)

    await wrapper.setProps({ modelValue: true })
    expect(wrapper.classes()).toContain('is-active')
  })

  it('keeps manual trigger event-free and blocks disabled interactions', async () => {
    const manual = mount(TxFusion, {
      props: {
        trigger: 'manual',
      },
    })

    await manual.trigger('mouseenter')
    await manual.trigger('click')
    await manual.trigger('mouseleave')
    expect(manual.emitted('update:modelValue')).toBeUndefined()

    const disabled = mount(TxFusion, {
      props: {
        disabled: true,
        trigger: 'click',
      },
    })

    await disabled.trigger('click')
    expect(disabled.classes()).toContain('is-disabled')
    expect(disabled.emitted('update:modelValue')).toBeUndefined()
  })
})
