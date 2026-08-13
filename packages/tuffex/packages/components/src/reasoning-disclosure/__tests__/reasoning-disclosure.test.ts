import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import TxReasoningDisclosure from '../src/TxReasoningDisclosure.vue'

describe('txReasoningDisclosure', () => {
  it('shows the thinking label with shimmer while streaming', () => {
    const wrapper = mount(TxReasoningDisclosure, {
      props: { text: 'partial thought', streaming: true },
    })

    expect(wrapper.classes()).toContain('is-streaming')
    expect(wrapper.find('.tx-reasoning-disclosure__label').text()).toBe('Thinking…')
    expect(wrapper.find('.tx-reasoning-disclosure__duration').exists()).toBe(false)
  })

  it('settles into the label plus formatted duration', () => {
    const wrapper = mount(TxReasoningDisclosure, {
      props: { text: 'full thought', streaming: false, durationMs: 3240 },
    })

    expect(wrapper.classes()).not.toContain('is-streaming')
    expect(wrapper.find('.tx-reasoning-disclosure__label').text()).toBe('Reasoning')
    expect(wrapper.find('.tx-reasoning-disclosure__duration').text()).toBe('Thought for 3.2s')
  })

  it('accepts a custom duration formatter', () => {
    const wrapper = mount(TxReasoningDisclosure, {
      props: {
        text: 't',
        durationMs: 61_000,
        durationFormatter: (ms: number) => `思考了 ${Math.round(ms / 1000)} 秒`,
      },
    })

    expect(wrapper.find('.tx-reasoning-disclosure__duration').text()).toBe('思考了 61 秒')
  })

  it('toggles open through an accessible header and keeps the text reachable', async () => {
    const wrapper = mount(TxReasoningDisclosure, {
      props: { text: 'the reasoning body', streaming: true },
    })

    const header = wrapper.find('.tx-reasoning-disclosure__header')
    const collapse = wrapper.find('.tx-reasoning-disclosure__collapse')

    expect(header.attributes('aria-expanded')).toBe('false')
    expect(header.attributes('aria-controls')).toBe(collapse.attributes('id'))

    await header.trigger('click')
    expect(collapse.classes()).toContain('is-open')
    expect(wrapper.find('.tx-reasoning-disclosure__text').text()).toBe('the reasoning body')
    expect(wrapper.emitted('toggle')).toEqual([[true]])
  })

  it('respects defaultOpen', () => {
    const wrapper = mount(TxReasoningDisclosure, {
      props: { text: 'body', defaultOpen: true },
    })

    expect(wrapper.find('.tx-reasoning-disclosure__collapse').classes()).toContain('is-open')
  })
})
