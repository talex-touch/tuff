import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import TxLoadingOverlay from '../src/TxLoadingOverlay.vue'

const SpinnerStub = {
  name: 'TxSpinner',
  props: {
    size: { type: Number, default: 16 },
  },
  template: '<span class="spinner-stub" :data-size="size" />',
}

function mountOverlay(props: Record<string, unknown> = {}, slots: Record<string, string> = {}) {
  return mount(TxLoadingOverlay, {
    props,
    slots,
    global: {
      stubs: {
        TxSpinner: SpinnerStub,
      },
    },
  })
}

describe('txLoadingOverlay', () => {
  it('renders slotted content and an in-container overlay when loading', () => {
    const wrapper = mountOverlay({
      loading: true,
      text: 'Loading records',
      spinnerSize: 24,
      background: 'rgba(0, 0, 0, 0.2)',
    }, {
      default: '<div class="content">Content</div>',
    })
    const overlay = wrapper.find('.tx-loading-overlay')

    expect(wrapper.find('.content').text()).toBe('Content')
    expect(overlay.exists()).toBe(true)
    expect(overlay.classes()).not.toContain('tx-loading-overlay--fullscreen')
    expect(overlay.attributes('style')).toContain('--tx-loading-overlay-bg: rgba(0, 0, 0, 0.2)')
    expect(wrapper.find('.spinner-stub').attributes('data-size')).toBe('24')
    expect(wrapper.find('.tx-loading-overlay__text').text()).toBe('Loading records')
  })

  it('keeps container content without rendering an overlay when closed', () => {
    const wrapper = mountOverlay({ loading: false }, {
      default: '<div class="content">Content</div>',
    })

    expect(wrapper.find('.content').exists()).toBe(true)
    expect(wrapper.find('.tx-loading-overlay').exists()).toBe(false)
  })

  it('teleports fullscreen overlay to the document body', async () => {
    const wrapper = mountOverlay({
      fullscreen: true,
      loading: true,
      text: 'Syncing',
    })

    try {
      const overlay = document.body.querySelector('.tx-loading-overlay--fullscreen')

      expect(overlay).not.toBeNull()
      expect(overlay?.textContent).toContain('Syncing')
      expect(wrapper.find('.tx-loading-overlay__container').exists()).toBe(false)
    }
    finally {
      wrapper.unmount()
    }
  })
})
