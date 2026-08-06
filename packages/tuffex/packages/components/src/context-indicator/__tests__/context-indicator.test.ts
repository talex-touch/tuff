import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import TxContextIndicator from '../src/TxContextIndicator.vue'

describe('txContextIndicator', () => {
  it('formats compact token counts and exposes meter semantics', () => {
    const wrapper = mount(TxContextIndicator, {
      props: { usedTokens: 12_300, maxTokens: 200_000 },
    })

    expect(wrapper.find('.tx-context-indicator__text').text()).toBe('12.3K / 200.0K')
    expect(wrapper.attributes('role')).toBe('meter')
    expect(wrapper.attributes('aria-valuenow')).toBe('12300')
    expect(wrapper.attributes('data-level')).toBe('ok')
  })

  it('steps through warning and danger levels', async () => {
    const wrapper = mount(TxContextIndicator, {
      props: { usedTokens: 170_000, maxTokens: 200_000 },
    })
    expect(wrapper.attributes('data-level')).toBe('warning')

    await wrapper.setProps({ usedTokens: 195_000 })
    expect(wrapper.attributes('data-level')).toBe('danger')
  })

  it('sizes the arc by the used ratio and clamps overflow', async () => {
    const wrapper = mount(TxContextIndicator, {
      props: { usedTokens: 100_000, maxTokens: 200_000 },
    })

    const arc = wrapper.find('.tx-context-indicator__arc')
    const dasharray = Number(arc.attributes('stroke-dasharray'))
    expect(Number(arc.attributes('stroke-dashoffset'))).toBeCloseTo(dasharray / 2, 5)

    await wrapper.setProps({ usedTokens: 999_999_999 })
    expect(Number(wrapper.find('.tx-context-indicator__arc').attributes('stroke-dashoffset'))).toBe(0)
  })

  it('accepts a custom formatter and tolerates a zero max', () => {
    const wrapper = mount(TxContextIndicator, {
      props: {
        usedTokens: 42,
        maxTokens: 0,
        formatter: (used: number, max: number) => `${used}/${max} tokens`,
      },
    })

    expect(wrapper.find('.tx-context-indicator__text').text()).toBe('42/0 tokens')
    expect(wrapper.attributes('data-level')).toBe('ok')
  })
})
