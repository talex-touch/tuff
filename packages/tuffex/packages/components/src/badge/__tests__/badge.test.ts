import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import TxBadge from '../src/TxBadge.vue'

describe('txBadge', () => {
  it('renders value and variant class', () => {
    const wrapper = mount(TxBadge, {
      props: {
        value: 'New',
        variant: 'primary',
      },
    })

    expect(wrapper.text()).toBe('New')
    expect(wrapper.classes()).toContain('tx-badge--primary')
  })

  it('renders default slot as custom pill content', () => {
    const wrapper = mount(TxBadge, {
      props: {
        value: 8,
      },
      slots: {
        default: '<strong>Beta</strong>',
      },
    })

    expect(wrapper.text()).toBe('Beta')
    expect(wrapper.find('strong').exists()).toBe(true)
  })

  it('renders dot mode without value text', () => {
    const wrapper = mount(TxBadge, {
      props: {
        dot: true,
        value: 8,
        variant: 'error',
      },
    })

    expect(wrapper.classes()).toContain('tx-badge--dot')
    expect(wrapper.find('.tx-badge__dot').exists()).toBe(true)
    expect(wrapper.text()).toBe('')
  })

  it('applies custom color variables', () => {
    const wrapper = mount(TxBadge, {
      props: {
        value: 3,
        color: '#111827',
      },
    })

    expect(wrapper.attributes('style')).toContain('--tx-badge-bg: #111827')
    expect(wrapper.attributes('style')).toContain('--tx-badge-text: #ffffff')
  })

  it('keeps a custom-color dot visible via a dedicated dot color variable', () => {
    const wrapper = mount(TxBadge, {
      props: {
        dot: true,
        color: '#22c55e',
      },
    })

    // Before the fix the dot inherited the forced white text color and vanished
    // against the white-filled badge. Its color must derive from the custom color.
    expect(wrapper.attributes('style')).toContain('--tx-badge-dot: #22c55e')
    expect(wrapper.attributes('style')).toContain('--tx-badge-bg: #22c55e')
    expect(wrapper.find('.tx-badge__dot').exists()).toBe(true)
  })
})
