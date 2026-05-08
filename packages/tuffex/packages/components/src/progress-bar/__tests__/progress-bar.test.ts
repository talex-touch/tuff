import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import TxProgressBar from '../src/TxProgressBar.vue'

describe('txProgressBar', () => {
  it('clamps determinate progress and exposes progressbar state', async () => {
    const wrapper = mount(TxProgressBar, {
      props: {
        percentage: 140,
        showText: true,
      },
    })

    const track = wrapper.find('.tx-progress-bar__track')
    expect(track.attributes('role')).toBe('progressbar')
    expect(track.attributes('aria-valuenow')).toBe('100')
    expect(wrapper.attributes('style')).toContain('--tx-progress-width: 100%')
    expect(wrapper.text()).toContain('100%')

    await wrapper.setProps({ percentage: -20 })
    expect(track.attributes('aria-valuenow')).toBe('0')
    expect(wrapper.attributes('style')).toContain('--tx-progress-width: 0%')
  })

  it('omits aria-valuenow in indeterminate mode', () => {
    const wrapper = mount(TxProgressBar, {
      props: {
        indeterminate: true,
        message: 'Syncing',
        showText: true,
      },
    })

    expect(wrapper.find('.tx-progress-bar__track').attributes('aria-valuenow')).toBeUndefined()
    expect(wrapper.find('.tx-progress-bar').classes()).toContain('tx-progress-bar--indeterminate')
    expect(wrapper.text()).toContain('Syncing')
  })

  it('emits complete once per completion cycle', async () => {
    const wrapper = mount(TxProgressBar, {
      props: {
        percentage: 90,
      },
    })

    await wrapper.setProps({ percentage: 100 })
    await wrapper.setProps({ percentage: 100 })
    expect(wrapper.emitted('complete')).toHaveLength(1)

    await wrapper.setProps({ percentage: 50 })
    await wrapper.setProps({ percentage: 100 })
    expect(wrapper.emitted('complete')).toHaveLength(2)
  })

  it('normalizes segment widths by positive segment sum', () => {
    const wrapper = mount(TxProgressBar, {
      props: {
        segments: [
          { value: 1, color: 'red' },
          { value: 3, color: 'blue' },
          { value: -2, color: 'gray' },
        ],
      },
    })

    const segments = wrapper.findAll('.tx-progress-bar__segment')
    expect(segments).toHaveLength(2)
    expect(segments[0].attributes('style')).toContain('width: 25%')
    expect(segments[1].attributes('style')).toContain('width: 75%')
  })
})
