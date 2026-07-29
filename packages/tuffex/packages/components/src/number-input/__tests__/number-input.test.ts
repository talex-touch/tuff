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

  it('allows typing a value above min without early clamping', async () => {
    const wrapper = mount(TxNumberInput, {
      props: {
        modelValue: null,
        min: 10,
      },
    })

    const input = wrapper.find('input')
    await input.trigger('focus')

    // First keystroke "5" is below min but must NOT be rewritten to 10.
    await input.setValue('5')
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([5])

    // The full target "50" types through cleanly.
    await input.setValue('50')
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([50])

    // 50 is within range, so blur leaves it untouched.
    await input.trigger('blur')
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([50])
  })

  it('does not emit on a focus/blur round trip that leaves the value unchanged', async () => {
    const wrapper = mount(TxNumberInput, {
      props: {
        modelValue: 5,
      },
    })
    const input = wrapper.find('input')

    await input.trigger('focus')
    await input.trigger('blur')

    // An untouched field must not dirty the model or emit a spurious change.
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    expect(wrapper.emitted('change')).toBeUndefined()
    expect(wrapper.emitted('blur')).toHaveLength(1)
  })

  it('clamps an out-of-range value back into range on blur', async () => {
    const wrapper = mount(TxNumberInput, {
      props: {
        modelValue: null,
        min: 10,
        max: 20,
      },
    })

    const input = wrapper.find('input')
    await input.trigger('focus')

    // While typing the value stays unclamped.
    await input.setValue('5')
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([5])

    // On blur it is pulled back into [min, max].
    await input.trigger('blur')
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([10])
  })

  it('does not rewrite the field to the clamped value while editing (v-model)', async () => {
    const Parent = {
      components: { TxNumberInput },
      data: () => ({ value: null as number | null }),
      template: '<TxNumberInput v-model="value" :min="10" />',
    }
    const wrapper = mount(Parent)
    const input = wrapper.find('input')

    await input.trigger('focus')
    await input.setValue('5')
    await wrapper.vm.$nextTick()

    // Model receives the unclamped 5, and the field still shows "5".
    expect((wrapper.vm as unknown as { value: number | null }).value).toBe(5)
    expect((input.element as HTMLInputElement).value).toBe('5')
  })

  it('localizes the increment/decrement button aria-labels', () => {
    const wrapper = mount(TxNumberInput, {
      props: { modelValue: 1, decreaseLabel: '减少', increaseLabel: '增加' },
    })

    // Pre-fix both were hardcoded English, and inheritAttrs:false routed
    // fallthrough attrs to the input, so consumers could not override them.
    const buttons = wrapper.findAll('button')
    expect(buttons[0].attributes('aria-label')).toBe('减少')
    expect(buttons[1].attributes('aria-label')).toBe('增加')
  })
})
