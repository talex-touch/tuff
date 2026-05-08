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

    expect(wrapper.attributes('role')).toBe('alert')
    expect(wrapper.classes()).toContain('tx-alert--success')
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
})
