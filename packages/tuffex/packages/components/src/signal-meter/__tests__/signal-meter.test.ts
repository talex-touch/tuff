import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import TxSignalMeter from '../src/TxSignalMeter.vue'

function filledCount(wrapper: ReturnType<typeof mount>): number {
  return wrapper.findAll('.tx-bui-signal-meter__bar.is-filled').length
}

describe('txSignalMeter', () => {
  it('renders `max` bars and lights `value` of them', () => {
    const wrapper = mount(TxSignalMeter, { props: { value: 2 } })

    expect(wrapper.findAll('.tx-bui-signal-meter__bar')).toHaveLength(3)
    expect(filledCount(wrapper)).toBe(2)
  })

  it('tracks the controlled value', async () => {
    const wrapper = mount(TxSignalMeter, { props: { value: 0 } })
    expect(filledCount(wrapper)).toBe(0)

    await wrapper.setProps({ value: 3 })
    expect(filledCount(wrapper)).toBe(3)
  })

  it('clamps out-of-range values instead of over- or under-filling', () => {
    expect(filledCount(mount(TxSignalMeter, { props: { value: 99 } }))).toBe(3)
    expect(filledCount(mount(TxSignalMeter, { props: { value: -4 } }))).toBe(0)
  })

  it('honours a custom bar count', () => {
    const wrapper = mount(TxSignalMeter, { props: { value: 4, max: 5 } })

    expect(wrapper.findAll('.tx-bui-signal-meter__bar')).toHaveLength(5)
    expect(filledCount(wrapper)).toBe(4)
  })

  it('names itself only when labelled, and hides the bare bars otherwise', async () => {
    const wrapper = mount(TxSignalMeter, { props: { value: 3 } })

    expect(wrapper.attributes('aria-hidden')).toBe('true')
    expect(wrapper.attributes('role')).toBeUndefined()

    await wrapper.setProps({ label: 'High confidence' })
    expect(wrapper.attributes('role')).toBe('img')
    expect(wrapper.attributes('aria-label')).toBe('High confidence')
    expect(wrapper.attributes('aria-hidden')).toBeUndefined()
  })

  it('exposes tone and geometry as custom properties', () => {
    const wrapper = mount(TxSignalMeter, {
      props: { value: 1, tone: 'var(--tx-bui-orange)', barHeight: 14, barWidth: 3 },
    })

    const style = wrapper.attributes('style') ?? ''
    expect(style).toContain('--tx-bui-signal-meter-tone: var(--tx-bui-orange)')
    expect(style).toContain('--tx-bui-signal-meter-height: 14px')
    expect(style).toContain('--tx-bui-signal-meter-width: 3px')
  })
})
