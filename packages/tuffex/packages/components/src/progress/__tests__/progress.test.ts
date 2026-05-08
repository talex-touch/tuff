import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import TuffProgress from '../src/TxProgress.vue'

describe('tuffProgress', () => {
  it('forwards percentage, status, stroke width, and formatted outside text', () => {
    const wrapper = mount(TuffProgress, {
      props: {
        percentage: 42,
        status: 'warning',
        strokeWidth: 12,
        format: (percentage: number) => `Done ${percentage}%`,
      },
    })

    const track = wrapper.find('.tx-progress-bar__track')
    expect(track.attributes('aria-valuenow')).toBe('42')
    expect(wrapper.find('.tx-progress-bar').classes()).toContain('tx-progress-bar--status-warning')
    expect(wrapper.attributes('style')).toContain('--tx-progress-height: 12px')
    expect(wrapper.text()).toContain('Done 42%')
  })

  it('can hide text and render indeterminate state', () => {
    const wrapper = mount(TuffProgress, {
      props: {
        percentage: 60,
        showText: false,
        indeterminate: true,
      },
    })

    expect(wrapper.text()).not.toContain('60%')
    expect(wrapper.find('.tx-progress-bar__track').attributes('aria-valuenow')).toBeUndefined()
    expect(wrapper.find('.tx-progress-bar').classes()).toContain('tx-progress-bar--indeterminate')
  })
})
