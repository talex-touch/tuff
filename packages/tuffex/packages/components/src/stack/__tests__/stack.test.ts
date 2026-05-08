import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import TxStack from '../src/TxStack.vue'

describe('txStack', () => {
  it('renders default vertical stack variables and slot content', () => {
    const wrapper = mount(TxStack, {
      slots: {
        default: '<span>First</span><span>Second</span>',
      },
    })
    const stack = wrapper.find('.tx-stack')
    const style = stack.attributes('style')

    expect(stack.text()).toContain('First')
    expect(stack.text()).toContain('Second')
    expect(style).toContain('--tx-stack-gap: 12px')
    expect(style).toContain('--tx-stack-align: stretch')
    expect(style).toContain('--tx-stack-justify: flex-start')
    expect(style).toContain('--tx-stack-direction: column')
    expect(style).toContain('--tx-stack-wrap: nowrap')
    expect(style).toContain('--tx-stack-display: flex')
  })

  it('maps horizontal layout props to CSS variables', () => {
    const wrapper = mount(TxStack, {
      props: {
        direction: 'horizontal',
        gap: '1rem',
        align: 'center',
        justify: 'space-between',
        wrap: true,
        inline: true,
      },
    })
    const style = wrapper.find('.tx-stack').attributes('style')

    expect(style).toContain('--tx-stack-gap: 1rem')
    expect(style).toContain('--tx-stack-align: center')
    expect(style).toContain('--tx-stack-justify: space-between')
    expect(style).toContain('--tx-stack-direction: row')
    expect(style).toContain('--tx-stack-wrap: wrap')
    expect(style).toContain('--tx-stack-display: inline-flex')
  })

  it('normalizes numeric gap to pixels', () => {
    const wrapper = mount(TxStack, {
      props: {
        gap: 6,
      },
    })

    expect(wrapper.find('.tx-stack').attributes('style')).toContain('--tx-stack-gap: 6px')
  })
})
