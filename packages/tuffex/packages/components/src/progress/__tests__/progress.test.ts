import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import InstalledProgress from '../index'
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

  it('inherits the flat track instead of forcing an opaque mask', () => {
    const wrapper = mount(TuffProgress, {
      props: {
        percentage: 60,
      },
    })

    expect(wrapper.classes()).toContain('tx-progress-bar-wrapper--mask-plain')
    expect(wrapper.classes()).not.toContain('tx-progress-bar-wrapper--bg-mask')
    expect(wrapper.find('.tx-progress-bar__mask').exists()).toBe(false)
  })

  it('registers the component through install', () => {
    const app = { component: vi.fn() }

    InstalledProgress.install?.(app as any)

    expect(app.component).toHaveBeenCalledWith('TuffProgress', InstalledProgress)
  })
})
