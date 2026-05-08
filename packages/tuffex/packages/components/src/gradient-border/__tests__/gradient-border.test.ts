import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import TxGradientBorder from '../src/TxGradientBorder.vue'

describe('txGradientBorder', () => {
  it('renders the default root element and slot content', () => {
    const wrapper = mount(TxGradientBorder, {
      slots: {
        default: '<span class="content">Content</span>',
      },
    })

    expect(wrapper.element.tagName).toBe('DIV')
    expect(wrapper.classes()).toContain('tx-gradient-border')
    expect(wrapper.find('.tx-gradient-border__inner .content').text()).toBe('Content')
  })

  it('uses the requested root element', () => {
    const wrapper = mount(TxGradientBorder, {
      props: {
        as: 'section',
      },
    })

    expect(wrapper.element.tagName).toBe('SECTION')
  })

  it('maps numeric props to px and duration to seconds', () => {
    const wrapper = mount(TxGradientBorder, {
      props: {
        borderWidth: 3,
        borderRadius: 18,
        padding: 20,
        animationDuration: 6,
      },
    })
    const style = wrapper.attributes('style')

    expect(style).toContain('--tx-gradient-border-width: 3px')
    expect(style).toContain('--tx-gradient-border-radius: 18px')
    expect(style).toContain('--tx-gradient-inner-padding: 20px')
    expect(style).toContain('--tx-gradient-duration: 6s')
  })

  it('preserves string CSS units', () => {
    const wrapper = mount(TxGradientBorder, {
      props: {
        borderWidth: '0.125rem',
        borderRadius: 'var(--radius-lg)',
        padding: '1rem 1.5rem',
      },
    })
    const style = wrapper.attributes('style')

    expect(style).toContain('--tx-gradient-border-width: 0.125rem')
    expect(style).toContain('--tx-gradient-border-radius: var(--radius-lg)')
    expect(style).toContain('--tx-gradient-inner-padding: 1rem 1.5rem')
  })
})
