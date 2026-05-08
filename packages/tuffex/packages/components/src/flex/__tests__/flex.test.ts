import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import TxFlex from '../src/TxFlex.vue'

describe('txFlex', () => {
  it('renders default flex variables and slot content', () => {
    const wrapper = mount(TxFlex, {
      slots: {
        default: '<span>Left</span><span>Right</span>',
      },
    })
    const flex = wrapper.find('.tx-flex')
    const style = flex.attributes('style')

    expect(flex.text()).toContain('Left')
    expect(flex.text()).toContain('Right')
    expect(style).toContain('--tx-flex-gap: 12px')
    expect(style).toContain('--tx-flex-align: stretch')
    expect(style).toContain('--tx-flex-justify: flex-start')
    expect(style).toContain('--tx-flex-direction: row')
    expect(style).toContain('--tx-flex-wrap: nowrap')
    expect(style).toContain('--tx-flex-display: flex')
  })

  it('maps custom layout props to CSS variables', () => {
    const wrapper = mount(TxFlex, {
      props: {
        direction: 'column-reverse',
        gap: '0.75rem',
        align: 'center',
        justify: 'space-between',
        wrap: 'wrap-reverse',
        inline: true,
      },
    })
    const style = wrapper.find('.tx-flex').attributes('style')

    expect(style).toContain('--tx-flex-gap: 0.75rem')
    expect(style).toContain('--tx-flex-align: center')
    expect(style).toContain('--tx-flex-justify: space-between')
    expect(style).toContain('--tx-flex-direction: column-reverse')
    expect(style).toContain('--tx-flex-wrap: wrap-reverse')
    expect(style).toContain('--tx-flex-display: inline-flex')
  })

  it('normalizes numeric gap to pixels', () => {
    const wrapper = mount(TxFlex, {
      props: {
        gap: 8,
      },
    })

    expect(wrapper.find('.tx-flex').attributes('style')).toContain('--tx-flex-gap: 8px')
  })
})
