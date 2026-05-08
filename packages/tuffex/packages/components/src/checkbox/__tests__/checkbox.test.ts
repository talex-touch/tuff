import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import TxCheckbox from '../src/TxCheckbox.vue'

describe('txCheckbox', () => {
  it('renders label text and checked aria state', () => {
    const wrapper = mount(TxCheckbox, {
      props: {
        modelValue: true,
        label: 'Enable sync',
      },
    })

    expect(wrapper.text()).toContain('Enable sync')
    expect(wrapper.classes()).toContain('is-checked')
    expect(wrapper.attributes('role')).toBe('checkbox')
    expect(wrapper.attributes('aria-checked')).toBe('true')
    expect(wrapper.attributes('tabindex')).toBe('0')
  })

  it('uses aria-label only when no visible label is present', () => {
    const wrapper = mount(TxCheckbox, {
      props: {
        ariaLabel: 'Toggle item',
      },
    })

    expect(wrapper.attributes('aria-label')).toBe('Toggle item')

    const labelled = mount(TxCheckbox, {
      props: {
        label: 'Visible label',
        ariaLabel: 'Hidden label',
      },
    })

    expect(labelled.attributes('aria-label')).toBeUndefined()
  })

  it('renders label before the box when labelPlacement is start', () => {
    const wrapper = mount(TxCheckbox, {
      props: {
        label: 'Before',
        labelPlacement: 'start',
      },
    })

    expect(wrapper.element.firstElementChild?.classList.contains('tx-checkbox__label')).toBe(true)
  })

  it('emits v-model and change events on click and keyboard toggle', async () => {
    const wrapper = mount(TxCheckbox, {
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
    expect(wrapper.emitted('update:modelValue')?.[2]).toEqual([false])
  })

  it('does not emit events when disabled', async () => {
    const wrapper = mount(TxCheckbox, {
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
