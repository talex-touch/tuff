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
    expect(wrapper.element.tagName).toBe('BUTTON')
    expect(wrapper.attributes('type')).toBe('button')
    expect(wrapper.attributes('role')).toBe('checkbox')
    expect(wrapper.attributes('aria-checked')).toBe('true')
    expect(wrapper.attributes('tabindex')).toBeUndefined()
  })

  it('uses aria-label only when no visible label is present', () => {
    const wrapper = mount(TxCheckbox, {
      props: {
        modelValue: false,
        ariaLabel: 'Toggle item',
      },
    })

    expect(wrapper.attributes('aria-label')).toBe('Toggle item')

    const labelled = mount(TxCheckbox, {
      props: {
        modelValue: false,
        label: 'Visible label',
        ariaLabel: 'Hidden label',
      },
    })

    expect(labelled.attributes('aria-label')).toBeUndefined()
  })

  it('renders label before the box when labelPlacement is start', () => {
    const wrapper = mount(TxCheckbox, {
      props: {
        modelValue: false,
        label: 'Before',
        labelPlacement: 'start',
      },
    })

    expect(wrapper.element.firstElementChild?.classList.contains('tx-checkbox__label')).toBe(true)
  })

  it('renders the configured fill variant without the inner checkmark', () => {
    const wrapper = mount(TxCheckbox, {
      props: {
        modelValue: true,
        label: 'Selected',
        variant: 'fill',
      },
    })

    expect(wrapper.classes()).toContain('tx-checkbox--fill')
    expect(wrapper.find('svg').exists()).toBe(false)
  })

  it('renders checkmark variant with the inner tick svg', () => {
    const wrapper = mount(TxCheckbox, {
      props: {
        modelValue: true,
        label: 'Selected',
        variant: 'checkmark',
      },
    })

    expect(wrapper.classes()).toContain('tx-checkbox--checkmark')
    expect(wrapper.find('svg .tx-checkbox__tick').exists()).toBe(true)
  })

  it('emits v-model and change events on click', async () => {
    const wrapper = mount(TxCheckbox, {
      props: {
        modelValue: false,
      },
    })

    await wrapper.trigger('click')
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([true])
    expect(wrapper.emitted('change')?.[0]).toEqual([true])

  })

  it('does not emit events when disabled', async () => {
    const wrapper = mount(TxCheckbox, {
      props: {
        modelValue: true,
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
