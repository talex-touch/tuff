import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import TxSwitch from '../src/TxSwitch.vue'

describe('txSwitch', () => {
  it('renders active aria state and size class', () => {
    const wrapper = mount(TxSwitch, {
      props: {
        modelValue: true,
        size: 'large',
      },
    })

    expect(wrapper.attributes('role')).toBe('switch')
    expect(wrapper.attributes('aria-checked')).toBe('true')
    expect(wrapper.attributes('aria-disabled')).toBe('false')
    expect(wrapper.attributes('tabindex')).toBe('0')
    expect(wrapper.classes()).toContain('is-active')
    expect(wrapper.classes()).toContain('tuff-switch--large')
  })

  it('emits v-model and change events on click and keyboard toggle', async () => {
    const wrapper = mount(TxSwitch, {
      props: {
        modelValue: false,
      },
    })

    await wrapper.trigger('click')

    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([true])
    expect(wrapper.emitted('change')?.[0]).toEqual([true])

    await wrapper.setProps({ modelValue: true })
    await wrapper.trigger('keydown', { key: 'Enter' })
    await wrapper.trigger('keydown', { key: ' ' })

    expect(wrapper.emitted('update:modelValue')?.[1]).toEqual([false])
    expect(wrapper.emitted('change')?.[1]).toEqual([false])
    expect(wrapper.emitted('update:modelValue')?.[2]).toEqual([false])
    expect(wrapper.emitted('change')?.[2]).toEqual([false])
  })

  it('does not emit events when disabled', async () => {
    const wrapper = mount(TxSwitch, {
      props: {
        disabled: true,
      },
    })

    await wrapper.trigger('click')
    await wrapper.trigger('keydown', { key: 'Enter' })
    await wrapper.trigger('keydown', { key: ' ' })

    expect(wrapper.classes()).toContain('is-disabled')
    expect(wrapper.attributes('aria-disabled')).toBe('true')
    expect(wrapper.attributes('tabindex')).toBe('-1')
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    expect(wrapper.emitted('change')).toBeUndefined()
  })
})
