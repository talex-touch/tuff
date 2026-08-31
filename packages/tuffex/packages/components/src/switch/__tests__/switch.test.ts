import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
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
    expect(wrapper.attributes('aria-busy')).toBeUndefined()
    // The track is a child now; the root is the flex wrapper that also holds
    // the label. State classes stay on the root.
    expect(wrapper.find('.tuff-switch__track .tuff-switch__thumb').exists()).toBe(true)
  })

  it('renders no label markup when none is given', () => {
    const wrapper = mount(TxSwitch)

    expect(wrapper.find('.tuff-switch__label').exists()).toBe(false)
    expect(wrapper.classes()).not.toContain('has-label')
  })

  it('renders a label prop through the text transformer', () => {
    const wrapper = mount(TxSwitch, {
      props: { label: 'Compact mode' },
    })

    expect(wrapper.classes()).toContain('has-label')
    expect(wrapper.text()).toContain('Compact mode')
    expect(wrapper.findComponent({ name: 'TxTextTransformer' }).exists()).toBe(true)
  })

  it('drops aria-label once a visible label names the control', () => {
    const wrapper = mount(TxSwitch, {
      props: { label: 'Compact mode', ariaLabel: 'Hidden name' },
    })

    expect(wrapper.attributes('aria-label')).toBeUndefined()

    const slotted = mount(TxSwitch, {
      props: { ariaLabel: 'Hidden name' },
      slots: { default: 'Slotted name' },
    })

    expect(slotted.attributes('aria-label')).toBeUndefined()
    expect(slotted.text()).toContain('Slotted name')
  })

  it('renders slot content directly rather than through the transformer', () => {
    const wrapper = mount(TxSwitch, {
      props: { label: 'ignored' },
      slots: { default: '<strong>Rich label</strong>' },
    })

    // Arbitrary nodes cannot be crossfaded as text, so the slot wins outright.
    expect(wrapper.find('.tuff-switch__label strong').exists()).toBe(true)
    expect(wrapper.findComponent({ name: 'TxTextTransformer' }).exists()).toBe(false)
  })

  it('crossfades the old label text when the label changes', async () => {
    const wrapper = mount(TxSwitch, {
      props: { label: 'Off' },
    })

    await wrapper.setProps({ label: 'On' })
    await nextTick()

    // Mid-transition the transformer keeps the outgoing text in a second,
    // aria-hidden layer. Its presence is what proves the animation ran rather
    // than the text being swapped in place.
    const prev = wrapper.find('.tx-text-transformer__layer--prev')
    expect(prev.exists()).toBe(true)
    expect(prev.text()).toBe('Off')
    expect(prev.attributes('aria-hidden')).toBe('true')
    expect(wrapper.find('.tx-text-transformer__layer--current').text()).toBe('On')
  })

  it('places the label before the track when labelPlacement is start', () => {
    const wrapper = mount(TxSwitch, {
      props: { label: 'Before', labelPlacement: 'start' },
    })

    expect(wrapper.element.firstElementChild?.classList.contains('tuff-switch__label')).toBe(true)

    const end = mount(TxSwitch, { props: { label: 'After' } })
    expect(end.element.firstElementChild?.classList.contains('tuff-switch__track')).toBe(true)
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

  it('does not emit events while loading', async () => {
    const wrapper = mount(TxSwitch, {
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
    const wrapper = mount(TxSwitch, {
      props: {
        modelValue: true,
        loading: true,
      },
    })

    expect(wrapper.classes()).toContain('is-loading')
    expect(wrapper.classes()).not.toContain('is-disabled')
    // The thumb stays on the active side so the ring marks which state is pending.
    expect(wrapper.classes()).toContain('is-active')
  })

  it('drops the busy state when loading resolves', async () => {
    const wrapper = mount(TxSwitch, {
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
