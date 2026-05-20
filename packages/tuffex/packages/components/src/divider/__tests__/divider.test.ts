import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import TxDivider from '../src/TxDivider.vue'

describe('txDivider', () => {
  it('renders horizontal divider with text', () => {
    const wrapper = mount(TxDivider, {
      props: {
        textPlacement: 'left',
        dashed: true,
      },
      slots: {
        default: 'More options',
      },
    })

    expect(wrapper.attributes('role')).toBe('separator')
    expect(wrapper.attributes('aria-orientation')).toBe('horizontal')
    expect(wrapper.classes()).toContain('tx-divider--text-left')
    expect(wrapper.classes()).toContain('tx-divider--dashed')
    expect(wrapper.find('.tx-divider__text').text()).toBe('More options')
  })

  it('renders vertical divider without text', () => {
    const wrapper = mount(TxDivider, {
      props: {
        direction: 'vertical',
      },
      slots: {
        default: 'Ignored',
      },
    })

    expect(wrapper.attributes('aria-orientation')).toBe('vertical')
    expect(wrapper.classes()).toContain('tx-divider--vertical')
    expect(wrapper.find('.tx-divider__text').exists()).toBe(false)
  })
})
