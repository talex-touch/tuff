import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import TxOutlineBorder from '../src/TxOutlineBorder.vue'

describe('txOutlineBorder', () => {
  it('renders the configured root tag and slot content', () => {
    const wrapper = mount(TxOutlineBorder, {
      props: {
        as: 'figure',
      },
      slots: {
        default: '<img class="avatar" alt="avatar">',
      },
    })

    expect(wrapper.element.tagName).toBe('FIGURE')
    expect(wrapper.classes()).toContain('tx-outline-border')
    expect(wrapper.find('.tx-outline-border__inner .avatar').exists()).toBe(true)
  })

  it('maps border variant to border styles and numeric padding', () => {
    const wrapper = mount(TxOutlineBorder, {
      props: {
        variant: 'border',
        shape: 'rect',
        borderRadius: 10,
        borderWidth: 2,
        borderStyle: 'dashed',
        borderColor: 'red',
        padding: 4,
      },
    })
    const style = wrapper.attributes('style')

    expect(style).toContain('--tx-outline-radius: 10px')
    expect(style).toContain('--tx-outline-padding: 4px')
    expect(style).toContain('border: 2px dashed red')
  })

  it('uses ring-offset as the default visual style', () => {
    const wrapper = mount(TxOutlineBorder, {
      props: {
        ringWidth: 3,
        ringColor: 'blue',
        offset: 5,
        offsetBg: 'white',
      },
    })
    const style = wrapper.attributes('style')

    expect(style).toContain('--tx-outline-radius: 9999px')
    expect(style).toContain('box-shadow: 0 0 0 5px white, 0 0 0 calc(5px + 3px) blue')
  })

  it('maps ring and inset variants to box-shadow styles', () => {
    const ring = mount(TxOutlineBorder, {
      props: {
        variant: 'ring',
        borderWidth: '0.125rem',
        borderColor: 'green',
      },
    })
    const inset = mount(TxOutlineBorder, {
      props: {
        variant: 'ring-inset',
        ringWidth: 2,
        ringColor: 'purple',
      },
    })

    expect(ring.attributes('style')).toContain('box-shadow: 0 0 0 0.125rem green')
    expect(inset.attributes('style')).toContain('box-shadow: inset 0 0 0 2px purple')
  })

  it('applies overflow clipping by default', () => {
    const wrapper = mount(TxOutlineBorder)
    const contentStyle = wrapper.find('.tx-outline-border__content').attributes('style')

    expect(contentStyle).toContain('border-radius: var(--tx-outline-radius)')
    expect(contentStyle).toContain('overflow: hidden')
  })

  it('supports clip-path and mask clipping modes', () => {
    const clipped = mount(TxOutlineBorder, {
      props: {
        clipMode: 'clipPath',
        clipShape: 'hexagon',
      },
    })
    const masked = mount(TxOutlineBorder, {
      props: {
        shape: 'squircle',
        clipMode: 'mask',
      },
    })

    expect(clipped.find('.tx-outline-border__content').attributes('style')).toContain('clip-path: polygon(')
    expect(masked.find('.tx-outline-border__content').attributes('style')).toContain('mask-image: url("data:image/svg+xml')
  })

  it('can disable clipping styles', () => {
    const wrapper = mount(TxOutlineBorder, {
      props: {
        clipMode: 'none',
      },
    })

    expect(wrapper.find('.tx-outline-border__content').attributes('style')).toBeUndefined()
  })
})
