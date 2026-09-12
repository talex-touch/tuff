import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import TxAlert from '../src/TxAlert.vue'

describe('txAlert', () => {
  it('renders semantic type, title, message, and icon', () => {
    const wrapper = mount(TxAlert, {
      props: {
        type: 'success',
        title: 'Saved',
        message: 'Settings updated.',
      },
    })

    // The root is a <Transition>, so query the alert element rather than the
    // wrapper: under the default transition stub the wrapper is the stub.
    const alert = wrapper.find('.tx-alert')
    expect(alert.attributes('role')).toBe('alert')
    expect(alert.classes()).toContain('tx-alert--success')
    expect(wrapper.find('.tx-alert__title').text()).toBe('Saved')
    expect(wrapper.find('.tx-alert__message').text()).toBe('Settings updated.')
    expect(wrapper.find('.tx-alert__icon .tuff-icon').exists()).toBe(true)
  })

  it('supports title and default slots', () => {
    const wrapper = mount(TxAlert, {
      props: {
        message: 'Fallback message',
      },
      slots: {
        title: '<strong>Slot title</strong>',
        default: '<span>Slot body</span>',
      },
    })

    expect(wrapper.find('.tx-alert__title').text()).toBe('Slot title')
    expect(wrapper.find('.tx-alert__message').text()).toBe('Slot body')
  })

  it('can hide icon and close button', () => {
    const wrapper = mount(TxAlert, {
      props: {
        message: 'Persistent',
        showIcon: false,
        closable: false,
      },
    })

    expect(wrapper.find('.tx-alert__icon').exists()).toBe(false)
    expect(wrapper.find('.tx-alert__close').exists()).toBe(false)
    expect(wrapper.classes()).not.toContain('tx-alert--closable')
  })

  it('emits close from the close button', async () => {
    const wrapper = mount(TxAlert, {
      props: {
        message: 'Dismiss me',
      },
    })

    await wrapper.find('.tx-alert__close').trigger('click')

    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('renders the close button with an explicit button type', () => {
    const wrapper = mount(TxAlert, {
      props: {
        message: 'Dismiss me',
      },
    })

    expect(wrapper.find('.tx-alert__close').attributes('type')).toBe('button')
  })

  // Every type asked TxIcon for a name it did not have ('check-circle',
  // 'x-circle', 'alert-triangle', 'info'), and an unknown name falls back to
  // `{ type: 'class' }` — a CSS class with no icon behind it. The alert rendered
  // an empty box where its status glyph should be.
  it.each([
    ['success', 'check-circle'],
    ['error', 'x-circle'],
    ['warning', 'alert-triangle'],
    ['info', 'info'],
  ] as const)('resolves a real built-in glyph for %s', (type, icon) => {
    const wrapper = mount(TxAlert, { props: { type, title: 'T' } })
    const glyph = wrapper.find('.tx-alert__icon .tuff-icon')

    expect(glyph.attributes('data-icon-type')).toBe('builtin')
    expect(glyph.attributes('data-icon-value')).toBe(icon)
  })

  it('hides itself on close so the leave transition can run, and reopens', async () => {
    const wrapper = mount(TxAlert, {
      props: { title: 'T', closable: true },
      global: { stubs: { transition: false } },
    })

    await wrapper.find('.tx-alert__close').trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(1)
    expect(wrapper.find('.tx-alert').exists()).toBe(false)

    ;(wrapper.vm as unknown as { open: () => void }).open()
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.tx-alert').exists()).toBe(true)
  })

  it('keeps fallthrough attributes on the alert element, not the transition', () => {
    const wrapper = mount(TxAlert, {
      props: { title: 'T' },
      attrs: { 'data-host': 'yes' },
      global: { stubs: { transition: false } },
    })

    expect(wrapper.find('.tx-alert').attributes('data-host')).toBe('yes')
  })
})
