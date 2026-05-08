import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import TxSpinner from '../src/TxSpinner.vue'

describe('txSpinner', () => {
  it('renders default animated spinner with accessibility attributes', () => {
    const wrapper = mount(TxSpinner)
    const spinner = wrapper.find('.tx-spinner')

    expect(spinner.exists()).toBe(true)
    expect(spinner.attributes('aria-busy')).toBe('true')
    expect(spinner.attributes('aria-live')).toBe('polite')
    expect(wrapper.find('.tx-spinner-container').exists()).toBe(true)
    expect(wrapper.find('.tx-spinner__svg').exists()).toBe(false)
  })

  it('forwards size and stroke width through CSS variables', () => {
    const wrapper = mount(TxSpinner, {
      props: {
        size: 32,
        strokeWidth: 4,
      },
    })
    const style = wrapper.find('.tx-spinner').attributes('style')

    expect(style).toContain('--tx-spinner-size: 32px')
    expect(style).toContain('--tx-spinner-stroke: 4')
  })

  it('renders SVG fallback when requested', () => {
    const wrapper = mount(TxSpinner, {
      props: {
        fallback: true,
        size: 24,
        strokeWidth: 3,
      },
    })
    const svg = wrapper.find('.tx-spinner__svg')
    const circle = wrapper.find('.tx-spinner__circle')

    expect(svg.exists()).toBe(true)
    expect(svg.attributes('width')).toBe('24')
    expect(svg.attributes('height')).toBe('24')
    expect(circle.attributes('stroke-width')).toBe('3')
    expect(wrapper.find('.tx-spinner-container').exists()).toBe(false)
  })

  it('does not render when visible is false', () => {
    const wrapper = mount(TxSpinner, {
      props: {
        visible: false,
      },
    })

    expect(wrapper.find('.tx-spinner').exists()).toBe(false)
  })
})
