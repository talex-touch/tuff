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
})
