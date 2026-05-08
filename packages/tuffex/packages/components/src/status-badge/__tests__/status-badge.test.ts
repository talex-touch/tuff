import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import TxStatusBadge from '../src/TxStatusBadge.vue'

describe('txStatusBadge', () => {
  it('renders text, size, and explicit status tone', () => {
    const wrapper = mount(TxStatusBadge, {
      props: {
        text: 'Online',
        status: 'success',
        size: 'sm',
      },
    })

    expect(wrapper.attributes('role')).toBe('status')
    expect(wrapper.classes()).toContain('tx-status-badge--sm')
    expect(wrapper.find('.tx-status-badge__text').text()).toBe('Online')
    expect(wrapper.attributes('style')).toContain('--tx-status-color: var(--tx-color-success)')
  })

  it('maps status keys and lets explicit status take precedence', () => {
    const denied = mount(TxStatusBadge, {
      props: {
        text: 'Denied',
        statusKey: 'denied',
      },
    })
    expect(denied.attributes('style')).toContain('--tx-status-color: var(--tx-color-danger)')

    const explicit = mount(TxStatusBadge, {
      props: {
        text: 'Muted denied',
        status: 'muted',
        statusKey: 'denied',
      },
    })
    expect(explicit.attributes('style')).toContain('--tx-status-color: var(--tx-text-color-secondary)')
  })

  it('renders platform icon and supports osOnly', () => {
    const wrapper = mount(TxStatusBadge, {
      props: {
        text: 'macOS',
        os: 'macos',
        status: 'info',
      },
    })

    const icons = wrapper.findAll('.tx-status-badge__icon')
    expect(icons).toHaveLength(2)
    expect(icons[0].classes()).toContain('i-carbon-logo-apple')
    expect(icons[1].classes()).toContain('i-carbon-information')

    const osOnly = mount(TxStatusBadge, {
      props: {
        text: 'Linux',
        os: 'linux',
        osOnly: true,
      },
    })
    expect(osOnly.findAll('.tx-status-badge__icon')).toHaveLength(1)
    expect(osOnly.find('.tx-status-badge__icon').classes()).toContain('i-carbon-logo-tux')
  })

  it('uses custom icon and emits click', async () => {
    const wrapper = mount(TxStatusBadge, {
      props: {
        text: 'Custom',
        icon: 'i-carbon-star-filled',
      },
    })

    expect(wrapper.find('.tx-status-badge__icon').classes()).toContain('i-carbon-star-filled')

    await wrapper.trigger('click')
    expect(wrapper.emitted('click')?.[0][0]).toBeInstanceOf(MouseEvent)
  })
})
