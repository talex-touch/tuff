import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import TxCornerOverlay from '../src/TxCornerOverlay.vue'

describe('txCornerOverlay', () => {
  it('renders default content without overlay when overlay slot is absent', () => {
    const wrapper = mount(TxCornerOverlay, {
      slots: {
        default: '<span class="avatar">Avatar</span>',
      },
    })

    expect(wrapper.classes()).toContain('tx-corner-overlay')
    expect(wrapper.find('.avatar').text()).toBe('Avatar')
    expect(wrapper.find('.tx-corner-overlay__overlay').exists()).toBe(false)
  })

  it('renders overlay slot as an aria-hidden layer', () => {
    const wrapper = mount(TxCornerOverlay, {
      slots: {
        default: '<span>Base</span>',
        overlay: '<span class="badge">Badge</span>',
      },
    })
    const overlay = wrapper.find('.tx-corner-overlay__overlay')

    expect(overlay.exists()).toBe(true)
    expect(overlay.attributes('aria-hidden')).toBe('true')
    expect(overlay.find('.badge').text()).toBe('Badge')
  })

  it('uses bottom-right placement by default', () => {
    const wrapper = mount(TxCornerOverlay, {
      slots: {
        overlay: '<span />',
      },
    })
    const style = wrapper.find('.tx-corner-overlay__overlay').attributes('style')

    expect(style).toContain('pointer-events: none')
    expect(style).toContain('bottom: 0px')
    expect(style).toContain('right: 0px')
  })

  it('maps each placement to matching inset styles', () => {
    const cases = [
      { placement: 'top-left', expectedX: 'left', expectedY: 'top' },
      { placement: 'top-right', expectedX: 'right', expectedY: 'top' },
      { placement: 'bottom-left', expectedX: 'left', expectedY: 'bottom' },
      { placement: 'bottom-right', expectedX: 'right', expectedY: 'bottom' },
    ] as const

    for (const item of cases) {
      const wrapper = mount(TxCornerOverlay, {
        props: {
          placement: item.placement,
          offsetX: 4,
          offsetY: 8,
        },
        slots: {
          overlay: '<span />',
        },
      })
      const style = wrapper.find('.tx-corner-overlay__overlay').attributes('style')

      expect(style).toContain(`${item.expectedX}: 4px`)
      expect(style).toContain(`${item.expectedY}: 8px`)
    }
  })

  it('preserves string offsets and pointer-event setting', () => {
    const wrapper = mount(TxCornerOverlay, {
      props: {
        offsetX: 'calc(100% - 12px)',
        offsetY: '-0.25rem',
        overlayPointerEvents: 'auto',
      },
      slots: {
        overlay: '<button>Open</button>',
      },
    })
    const style = wrapper.find('.tx-corner-overlay__overlay').attributes('style')

    expect(style).toContain('right: calc(100% - 12px)')
    expect(style).toContain('bottom: -0.25rem')
    expect(style).toContain('pointer-events: auto')
  })
})
