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

  it('defaults to the checkmark variant with the inner tick svg', () => {
    const wrapper = mount(TxCheckbox, {
      props: {
        modelValue: true,
        label: 'Selected',
      },
    })

    expect(wrapper.classes()).toContain('tx-checkbox--checkmark')
    expect(wrapper.find('svg .tx-checkbox__tick').exists()).toBe(true)
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

  it('announces a partial selection as mixed and draws the dash', () => {
    const wrapper = mount(TxCheckbox, {
      props: {
        modelValue: false,
        indeterminate: true,
        ariaLabel: 'Select all',
      },
    })

    // The dash is a visual claim; aria-checked="mixed" is what makes it true
    // for a screen reader. Rendering one without the other is the upstream bug.
    expect(wrapper.attributes('aria-checked')).toBe('mixed')
    expect(wrapper.classes()).toContain('is-indeterminate')
    expect(wrapper.find('.tx-checkbox__dash').exists()).toBe(true)
  })

  it('resolves a partial selection to checked when activated', async () => {
    const wrapper = mount(TxCheckbox, {
      props: { modelValue: true, indeterminate: true },
    })

    // Mixed means "some", so activating it must select all rather than flip the
    // underlying boolean back to false.
    await wrapper.trigger('click')
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([true])
    expect(wrapper.emitted('change')?.[0]).toEqual([true])
  })

  it('keeps the plain boolean aria state when not indeterminate', () => {
    const unchecked = mount(TxCheckbox, { props: { modelValue: false } })
    expect(unchecked.attributes('aria-checked')).toBe('false')
    expect(unchecked.classes()).not.toContain('is-indeterminate')
    expect(unchecked.find('.tx-checkbox__dash').exists()).toBe(false)
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

  it('does not emit events while loading', async () => {
    const wrapper = mount(TxCheckbox, {
      props: {
        modelValue: false,
        loading: true,
      },
    })

    await wrapper.trigger('click')

    expect(wrapper.attributes('disabled')).toBeDefined()
    expect(wrapper.attributes('aria-busy')).toBe('true')
    expect(wrapper.attributes('aria-disabled')).toBe('true')
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    expect(wrapper.emitted('change')).toBeUndefined()
  })

  it('keeps loading visually distinct from disabled', () => {
    const wrapper = mount(TxCheckbox, {
      props: {
        modelValue: true,
        loading: true,
      },
    })

    expect(wrapper.classes()).toContain('is-loading')
    expect(wrapper.classes()).not.toContain('is-disabled')
    // The fill still carries the value while the ring marks it as unresolved.
    expect(wrapper.classes()).toContain('is-checked')
  })

  it('keeps reporting mixed while a partial selection is loading', () => {
    const wrapper = mount(TxCheckbox, {
      props: {
        modelValue: false,
        indeterminate: true,
        loading: true,
        ariaLabel: 'Select all',
      },
    })

    expect(wrapper.attributes('aria-checked')).toBe('mixed')
    expect(wrapper.attributes('aria-busy')).toBe('true')
  })

  it('drops the busy state when loading resolves', async () => {
    const wrapper = mount(TxCheckbox, {
      props: {
        modelValue: false,
        loading: true,
      },
    })

    await wrapper.setProps({ loading: false })
    await wrapper.trigger('click')

    expect(wrapper.classes()).not.toContain('is-loading')
    expect(wrapper.attributes('aria-busy')).toBeUndefined()
    expect(wrapper.attributes('disabled')).toBeUndefined()
    expect(wrapper.emitted('change')?.[0]).toEqual([true])
  })
})
