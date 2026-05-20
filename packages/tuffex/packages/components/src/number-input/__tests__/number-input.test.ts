import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import TxNumberInput from '../src/TxNumberInput.vue'

describe('txNumberInput', () => {
  it('renders model value and numeric attrs', () => {
    const wrapper = mount(TxNumberInput, {
      props: {
        modelValue: 3,
        min: 0,
        max: 10,
        step: 2,
      },
    })

    const input = wrapper.find('input')
    expect(input.element.value).toBe('3')
    expect(input.attributes('min')).toBe('0')
    expect(input.attributes('max')).toBe('10')
    expect(input.attributes('step')).toBe('2')
  })

  it('emits normalized value on input', async () => {
    const wrapper = mount(TxNumberInput, {
      props: {
        modelValue: 1,
        precision: 1,
      },
    })

    await wrapper.find('input').setValue('2.34')

    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([2.3])
    expect(wrapper.emitted('change')?.[0]).toEqual([2.3])
  })

  it('steps with controls and clamps min/max', async () => {
    const wrapper = mount(TxNumberInput, {
      props: {
        modelValue: 9,
        min: 0,
        max: 10,
        step: 3,
      },
    })

    const buttons = wrapper.findAll('button')
    await buttons[1].trigger('click')
    await buttons[0].trigger('click')

    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([10])
    expect(wrapper.emitted('update:modelValue')?.[1]).toEqual([6])
  })

  it('hides controls and exposes focus helper', () => {
    const wrapper = mount(TxNumberInput, {
      props: {
        controls: false,
      },
    })

    expect(wrapper.find('button').exists()).toBe(false)
    expect(typeof wrapper.vm.focus).toBe('function')
  })
})
