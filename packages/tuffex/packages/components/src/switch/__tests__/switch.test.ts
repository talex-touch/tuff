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

    expect(wrapper.element.tagName).toBe('BUTTON')
    expect(wrapper.attributes('type')).toBe('button')
    expect(wrapper.attributes('role')).toBe('switch')
    expect(wrapper.attributes('aria-checked')).toBe('true')
    expect(wrapper.attributes('aria-disabled')).toBe('false')
    expect(wrapper.attributes('tabindex')).toBeUndefined()
    expect(wrapper.classes()).toContain('is-active')
    expect(wrapper.classes()).toContain('tuff-switch--large')
  })

  it('emits v-model and change events on click', async () => {
    const wrapper = mount(TxSwitch, {
      props: {
        modelValue: false,
      },
    })

    await wrapper.trigger('click')

    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([true])
    expect(wrapper.emitted('change')?.[0]).toEqual([true])
  })

  it('always exposes an accessible name', () => {
    const wrapper = mount(TxSwitch)

    expect(wrapper.attributes('aria-label')).toBe('Toggle')
  })

  it('accepts a custom accessible name', () => {
    const wrapper = mount(TxSwitch, {
      props: { ariaLabel: 'Enable notifications' },
    })

    expect(wrapper.attributes('aria-label')).toBe('Enable notifications')
  })

  it('prefers aria-labelledby over aria-label when a visible label exists', () => {
    const wrapper = mount(TxSwitch, {
      props: { ariaLabelledby: 'notifications-label' },
    })

    expect(wrapper.attributes('aria-labelledby')).toBe('notifications-label')
    expect(wrapper.attributes('aria-label')).toBeUndefined()
  })

  it('does not emit events when disabled', async () => {
    const wrapper = mount(TxSwitch, {
      props: {
        disabled: true,
      },
    })

    await wrapper.trigger('click')

    expect(wrapper.element.tagName).toBe('BUTTON')
    expect(wrapper.attributes('disabled')).toBeDefined()
    expect(wrapper.classes()).toContain('is-disabled')
    expect(wrapper.attributes('aria-disabled')).toBe('true')
    expect(wrapper.attributes('tabindex')).toBeUndefined()
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    expect(wrapper.emitted('change')).toBeUndefined()
  })
})
